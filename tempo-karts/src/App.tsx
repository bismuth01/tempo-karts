import { PrivyProvider, User, usePrivy, useWallets } from '@privy-io/react-auth';
import { useEffect, useMemo, useRef } from 'react';
import { EventBus } from './game/EventBus';
import { IRefPhaserGame, PhaserGame } from './PhaserGame';
import { BrowserProvider } from 'ethers';
import {
    deregisterPlayerIfRegistered,
    ensurePlayerRegistered,
    getOnChainContractConfig,
    readOnChainGameSnapshot,
    toReadableError,
    type OnChainActionRequest,
    type OnChainContractStatus
} from './chain/contracts';

type PrivyStatusPayload = {
    ready: boolean;
    authenticated: boolean;
    walletAddress: string | null;
    playerName: string;
    buttonLabel: string;
};

const defaultPlayerName = 'VillageRacer';

function resolvePlayerName (user: User | null): string
{
    if (!user)
    {
        return defaultPlayerName;
    }

    if (user.email?.address)
    {
        const [name] = user.email.address.split('@');

        if (name)
        {
            return name.slice(0, 18);
        }
    }

    if (user.wallet?.address)
    {
        const address = user.wallet.address;

        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }

    return defaultPlayerName;
}

function PrivyEnabledGameShell ()
{
    const phaserRef = useRef<IRefPhaserGame | null>(null);
    const { ready, authenticated, user, login, logout } = usePrivy();
    const { wallets, ready: walletsReady } = useWallets();

    const walletAddress = useMemo(() => user?.wallet?.address ?? null, [user]);
    const playerName = useMemo(() => resolvePlayerName(user), [user]);
    const contractConfig = useMemo(() => getOnChainContractConfig(), []);

    const activeWallet = useMemo(() => {
        if (!walletsReady || wallets.length === 0)
        {
            return null;
        }

        if (walletAddress)
        {
            const matched = wallets.find((wallet) => wallet.address.toLowerCase() === walletAddress.toLowerCase());
            if (matched)
            {
                return matched;
            }
        }

        return wallets[0];
    }, [walletAddress, wallets, walletsReady]);

    const status = useMemo<PrivyStatusPayload>(() => ({
        ready,
        authenticated,
        walletAddress,
        playerName,
        buttonLabel: !ready ? 'WAIT' : authenticated ? 'DISCONNECT' : 'CONNECT'
    }), [authenticated, playerName, ready, walletAddress]);

    const contractStatus = useMemo<OnChainContractStatus>(() => {
        const configured = contractConfig.enabled;
        const hasWallet = Boolean(activeWallet);
        const isReady = configured && ready && authenticated && walletsReady && hasWallet;

        let reason = contractConfig.reason;
        if (configured && !ready)
        {
            reason = 'Privy not ready';
        }
        else if (configured && ready && !authenticated)
        {
            reason = 'Wallet not connected';
        }
        else if (configured && ready && authenticated && !walletsReady)
        {
            reason = 'Wallets loading';
        }
        else if (configured && ready && authenticated && walletsReady && !hasWallet)
        {
            reason = 'No active wallet';
        }
        else if (isReady)
        {
            reason = 'Ready';
        }

        return {
            configured,
            ready: isReady,
            walletAddress: activeWallet?.address ?? walletAddress ?? null,
            gameManagerAddress: contractConfig.gameManagerAddress,
            expectedChainId: contractConfig.expectedChainId,
            reason
        };
    }, [activeWallet, authenticated, contractConfig, ready, walletAddress, walletsReady]);

    useEffect(() => {
        EventBus.emit('privy-status-changed', status);
    }, [status]);

    useEffect(() => {
        EventBus.emit('contract-status-changed', contractStatus);
    }, [contractStatus]);

    useEffect(() => {
        const handleConnectRequest = async () => {
            if (!ready)
            {
                return;
            }

            if (authenticated)
            {
                await logout();

                return;
            }

            login();
        };

        const handleStatusRequest = () => {
            EventBus.emit('privy-status-changed', status);
        };

        const handleContractStatusRequest = () => {
            EventBus.emit('contract-status-changed', contractStatus);
        };

        const handleContractActionRequest = async (request: OnChainActionRequest) => {
            try
            {
                if (!contractConfig.enabled)
                {
                    throw new Error(contractConfig.reason);
                }

                if (!contractStatus.ready || !activeWallet)
                {
                    throw new Error(contractStatus.reason);
                }

                if (contractConfig.expectedChainId !== null)
                {
                    await activeWallet.switchChain(contractConfig.expectedChainId);
                }

                const eip1193Provider = await activeWallet.getEthereumProvider();
                const provider = new BrowserProvider(eip1193Provider);
                const signer = await provider.getSigner(activeWallet.address);
                const gameManagerAddress = request.payload?.gameManagerAddress;

                if (request.action === 'snapshot')
                {
                    const playerAddress = request.payload?.playerAddress ?? activeWallet.address;
                    const snapshot = await readOnChainGameSnapshot(provider, {
                        playerAddress,
                        gameManagerAddress
                    });
                    request.resolve(snapshot);
                    return;
                }

                if (request.action === 'register-player')
                {
                    const result = await ensurePlayerRegistered(signer, { gameManagerAddress });
                    request.resolve(result);
                    return;
                }

                if (request.action === 'deregister-player')
                {
                    const result = await deregisterPlayerIfRegistered(signer, { gameManagerAddress });
                    request.resolve(result);
                    return;
                }

                throw new Error('Unsupported contract action');
            }
            catch (error)
            {
                request.reject(new Error(toReadableError(error)));
            }
        };

        EventBus.on('privy-connect-request', handleConnectRequest);
        EventBus.on('privy-status-request', handleStatusRequest);
        EventBus.on('contract-status-request', handleContractStatusRequest);
        EventBus.on('contract-action-request', handleContractActionRequest);

        return () => {
            EventBus.removeListener('privy-connect-request', handleConnectRequest);
            EventBus.removeListener('privy-status-request', handleStatusRequest);
            EventBus.removeListener('contract-status-request', handleContractStatusRequest);
            EventBus.removeListener('contract-action-request', handleContractActionRequest);
        };
    }, [activeWallet, contractConfig, contractStatus, login, logout, ready, authenticated, status]);

    return (
        <div id="app">
            <PhaserGame ref={phaserRef} />
        </div>
    );
}

function PrivyDisabledGameShell ()
{
    const phaserRef = useRef<IRefPhaserGame | null>(null);

    useEffect(() => {
        const status: PrivyStatusPayload = {
            ready: false,
            authenticated: false,
            walletAddress: null,
            playerName: defaultPlayerName,
            buttonLabel: 'NO APP ID'
        };

        const emitStatus = () => {
            EventBus.emit('privy-status-changed', status);
        };

        const contractStatus: OnChainContractStatus = {
            configured: false,
            ready: false,
            walletAddress: null,
            gameManagerAddress: null,
            expectedChainId: null,
            reason: 'Privy app id missing'
        };

        const emitContractStatus = () => {
            EventBus.emit('contract-status-changed', contractStatus);
        };

        const rejectContractAction = (request: OnChainActionRequest) => {
            request.reject(new Error('Contract bridge unavailable'));
        };

        EventBus.on('privy-status-request', emitStatus);
        EventBus.on('privy-connect-request', emitStatus);
        EventBus.on('contract-status-request', emitContractStatus);
        EventBus.on('contract-action-request', rejectContractAction);
        emitStatus();
        emitContractStatus();

        return () => {
            EventBus.removeListener('privy-status-request', emitStatus);
            EventBus.removeListener('privy-connect-request', emitStatus);
            EventBus.removeListener('contract-status-request', emitContractStatus);
            EventBus.removeListener('contract-action-request', rejectContractAction);
        };
    }, []);

    return (
        <div id="app">
            <PhaserGame ref={phaserRef} />
        </div>
    );
}

function App ()
{
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

    if (!appId)
    {
        return <PrivyDisabledGameShell />;
    }

    return (
        <PrivyProvider
            appId={appId}
            config={{
                embeddedWallets: {
                    ethereum: {
                        createOnLogin: 'users-without-wallets'
                    }
                }
            }}
        >
            <PrivyEnabledGameShell />
        </PrivyProvider>
    );
}

export default App;
