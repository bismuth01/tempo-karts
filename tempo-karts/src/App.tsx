import { PrivyProvider, User, usePrivy } from '@privy-io/react-auth';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EventBus } from './game/EventBus';
import { IRefPhaserGame, PhaserGame } from './PhaserGame';
import { useChainActions } from './chain/useChainActions';
import type { MultiplayerSession } from './game/net/multiplayer';
import { PredictionMarketPanel } from './components/PredictionMarketPanel';
import type { Address } from 'viem';

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
    const chainActions = useChainActions();

    const [session, setSession] = useState<MultiplayerSession | null>(null);

    const walletAddress = useMemo(() => user?.wallet?.address ?? null, [user]);
    const playerName = useMemo(() => resolvePlayerName(user), [user]);

    const status = useMemo<PrivyStatusPayload>(() => ({
        ready,
        authenticated,
        walletAddress,
        playerName,
        buttonLabel: !ready ? 'WAIT' : authenticated ? 'DISCONNECT' : 'CONNECT'
    }), [authenticated, playerName, ready, walletAddress]);

    useEffect(() => {
        EventBus.emit('privy-status-changed', status);
    }, [status]);

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

        EventBus.on('privy-connect-request', handleConnectRequest);
        EventBus.on('privy-status-request', handleStatusRequest);

        return () => {
            EventBus.removeListener('privy-connect-request', handleConnectRequest);
            EventBus.removeListener('privy-status-request', handleStatusRequest);
        };
    }, [authenticated, login, logout, ready, status]);

    // Bridge chain actions: Phaser emits requests, React executes and emits results
    useEffect(() => {
        const handleApproveAndRegister = async (payload: {
            stakeTokenAddress: string;
            gameManagerAddress: string;
            stakeAmount: string;
        }) => {
            try {
                const result = await chainActions.approveAndRegister(
                    payload.stakeTokenAddress as Address,
                    payload.gameManagerAddress as Address,
                    BigInt(payload.stakeAmount),
                );
                if (result.success) {
                    EventBus.emit('chain:result-success', { txHash: result.txHash });
                } else {
                    EventBus.emit('chain:result-error', { error: result.error });
                }
            } catch (err) {
                EventBus.emit('chain:result-error', {
                    error: err instanceof Error ? err.message : 'Chain action failed',
                });
            }
        };

        EventBus.on('chain:approve-and-register', handleApproveAndRegister);

        return () => {
            EventBus.removeListener('chain:approve-and-register', handleApproveAndRegister);
        };
    }, [chainActions]);

    // Track game session for showing prediction market overlay
    useEffect(() => {
        const handleSessionStarted = (s: MultiplayerSession) => {
            setSession(s);
        };

        const handleSessionEnded = () => {
            setSession(null);
        };

        EventBus.on('game-session-started', handleSessionStarted);
        EventBus.on('game-session-ended', handleSessionEnded);

        return () => {
            EventBus.removeListener('game-session-started', handleSessionStarted);
            EventBus.removeListener('game-session-ended', handleSessionEnded);
        };
    }, []);

    const isSpectator = session?.role === 'spectator';

    return (
        <div id="app">
            <PhaserGame ref={phaserRef} />
            {isSpectator && session && (
                <PredictionMarketPanel session={session} />
            )}
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

        EventBus.on('privy-status-request', emitStatus);
        EventBus.on('privy-connect-request', emitStatus);
        emitStatus();

        return () => {
            EventBus.removeListener('privy-status-request', emitStatus);
            EventBus.removeListener('privy-connect-request', emitStatus);
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
