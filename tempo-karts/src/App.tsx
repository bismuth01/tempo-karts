import { PrivyProvider, User, usePrivy } from '@privy-io/react-auth';
import { useEffect, useMemo, useRef } from 'react';
import { EventBus } from './game/EventBus';
import { IRefPhaserGame, PhaserGame } from './PhaserGame';

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
