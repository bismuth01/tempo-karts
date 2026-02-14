/**
 * PredictionMarketPanel — React overlay for spectator betting.
 * Sits on top of the Phaser canvas and shows live/static prediction markets
 * with odds, bet inputs, and payout estimates.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EventBus } from '../game/EventBus';
import type {
    MultiplayerSession,
    PlayerState,
    PredictionBetInfo,
    KillEvent,
    RoomState,
} from '../game/net/multiplayer';
import { useChainActions } from '../chain/useChainActions';
import type { Address } from 'viem';

type MarketBets = Record<string, bigint>; // playerAddr => totalBetAmount

type MarketState = {
    playerTotals: MarketBets;
    totalPool: bigint;
};

const emptyMarket = (): MarketState => ({ playerTotals: {}, totalPool: 0n });

const MARKET_LABELS: Record<string, string> = {
    liveAttacker: 'Next Kill (Attacker)',
    liveAttacked: 'Next Death (Attacked)',
    staticWinner: 'Game Winner',
    staticMostDeaths: 'Most Deaths',
};

export function PredictionMarketPanel({ session }: { session: MultiplayerSession }) {
    const chain = useChainActions();
    const [players, setPlayers] = useState<PlayerState[]>(session.room.players);
    const [currentRound, setCurrentRound] = useState(0);
    const [collapsed, setCollapsed] = useState(false);
    const [betBusy, setBetBusy] = useState(false);
    const [betResult, setBetResult] = useState<string | null>(null);

    // Track bets per market
    const [liveAttacker, setLiveAttacker] = useState<MarketState>(emptyMarket());
    const [liveAttacked, setLiveAttacked] = useState<MarketState>(emptyMarket());
    const [staticWinner, setStaticWinner] = useState<MarketState>(emptyMarket());
    const [staticMostDeaths, setStaticMostDeaths] = useState<MarketState>(emptyMarket());

    // Bet amount input
    const [betAmount, setBetAmount] = useState('1');

    const chainAddresses = useMemo(() => session.room.chain ?? {}, [session.room.chain]);

    // Listen for room state updates
    useEffect(() => {
        const handleState = (payload: { room: RoomState }) => {
            setPlayers(payload.room.players);
        };
        session.socket.on('room:state', handleState);
        return () => { session.socket.off('room:state', handleState); };
    }, [session.socket]);

    // Listen for bet broadcasts
    useEffect(() => {
        const handleBet = (bet: PredictionBetInfo) => {
            const amount = BigInt(bet.amount);
            const setFn = getMarketSetter(bet.marketType);
            if (!setFn) return;
            setFn((prev) => {
                const newTotals = { ...prev.playerTotals };
                newTotals[bet.playerChoice] = (newTotals[bet.playerChoice] ?? 0n) + amount;
                return { playerTotals: newTotals, totalPool: prev.totalPool + amount };
            });
        };

        const handleKill = (_payload: KillEvent) => {
            // Reset live markets on kill (new round)
            setCurrentRound((r) => r + 1);
            setLiveAttacker(emptyMarket());
            setLiveAttacked(emptyMarket());
        };

        session.socket.on('room:bet_placed', handleBet);
        EventBus.on('game:kill-event', handleKill);

        return () => {
            session.socket.off('room:bet_placed', handleBet);
            EventBus.removeListener('game:kill-event', handleKill);
        };
    }, [session.socket]);

    const getMarketSetter = useCallback((marketType: number) => {
        switch (marketType) {
            case 0: return setLiveAttacker;         // MarketType.Attacker
            case 1: return setLiveAttacked;         // MarketType.Attacked
            case 10: return setStaticWinner;        // StaticMarketType.Winner = 0, offset by 10
            case 11: return setStaticMostDeaths;    // StaticMarketType.MostDeaths = 1, offset by 10
            default: return null;
        }
    }, []);

    const calcOdds = useCallback((market: MarketState, playerAddr: string): string => {
        const playerBet = market.playerTotals[playerAddr] ?? 0n;
        if (playerBet === 0n || market.totalPool === 0n) return '∞';
        const odds = Number(market.totalPool) / Number(playerBet);
        return odds.toFixed(1) + 'x';
    }, []);

    const calcPayout = useCallback((market: MarketState, playerAddr: string, myBet: bigint): string => {
        const playerTotal = (market.playerTotals[playerAddr] ?? 0n) + myBet;
        if (playerTotal === 0n) return '0.00';
        const newPool = market.totalPool + myBet;
        const payout = (Number(myBet) * Number(newPool)) / Number(playerTotal);
        return payout.toFixed(2);
    }, []);

    const handlePlaceBet = useCallback(async (
        marketKey: string,
        playerAddr: string,
    ) => {
        if (betBusy || !chain.ready) return;
        setBetBusy(true);
        setBetResult(null);

        try {
            const amount = BigInt(Math.floor(parseFloat(betAmount) * 1e18));
            if (amount <= 0n) throw new Error('Invalid bet amount');

            const tokenAddr = chainAddresses.stakeTokenAddress as Address | undefined;
            if (!tokenAddr) throw new Error('No token address configured');

            let result;
            if (marketKey === 'liveAttacker' || marketKey === 'liveAttacked') {
                const marketAddr = chainAddresses.livePredictionMarketAddress as Address | undefined;
                if (!marketAddr) throw new Error('Live prediction market not deployed yet');
                const marketType = marketKey === 'liveAttacker' ? 0 : 1;
                result = await chain.placeLiveBet(marketAddr, tokenAddr, marketType, playerAddr as Address, amount);
            } else {
                const marketAddr = chainAddresses.staticPredictionMarketAddress as Address | undefined;
                if (!marketAddr) throw new Error('Static prediction market not deployed yet');
                const marketType = marketKey === 'staticWinner' ? 0 : 1;
                result = await chain.placeStaticBet(marketAddr, tokenAddr, marketType, playerAddr as Address, amount);
            }

            if (!result.success) throw new Error(result.error);

            // Notify server about the bet
            const betInfo: PredictionBetInfo = {
                bettor: 'local',
                marketType: marketKey === 'liveAttacker' ? 0
                    : marketKey === 'liveAttacked' ? 1
                    : marketKey === 'staticWinner' ? 10 : 11,
                playerChoice: playerAddr,
                amount: amount.toString(),
                round: currentRound,
                ts: Date.now(),
            };
            session.socket.emit('spectator:bet_placed', betInfo);

            setBetResult(`Bet placed! TX: ${result.txHash?.slice(0, 10)}...`);
        } catch (err) {
            setBetResult(err instanceof Error ? err.message : 'Bet failed');
        } finally {
            setBetBusy(false);
        }
    }, [betBusy, chain, betAmount, chainAddresses, currentRound, session.socket]);

    if (collapsed) {
        return (
            <div style={styles.collapsedTab} onClick={() => setCollapsed(false)}>
                <span style={{ fontSize: 18 }}>📊 MARKETS</span>
            </div>
        );
    }

    const markets = [
        { key: 'liveAttacker', state: liveAttacker, label: MARKET_LABELS.liveAttacker },
        { key: 'liveAttacked', state: liveAttacked, label: MARKET_LABELS.liveAttacked },
        { key: 'staticWinner', state: staticWinner, label: MARKET_LABELS.staticWinner },
        { key: 'staticMostDeaths', state: staticMostDeaths, label: MARKET_LABELS.staticMostDeaths },
    ];

    return (
        <div style={styles.panel}>
            <div style={styles.header}>
                <span style={styles.headerTitle}>📊 PREDICTION MARKETS</span>
                <span style={styles.round}>Round {currentRound + 1}</span>
                <button style={styles.collapseBtn} onClick={() => setCollapsed(true)}>—</button>
            </div>

            <div style={styles.betInput}>
                <label style={styles.label}>Bet Amount (tokens):</label>
                <input
                    type="number"
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    style={styles.input}
                    min="0.01"
                    step="0.1"
                />
            </div>

            {betResult && <div style={styles.betResult}>{betResult}</div>}

            <div style={styles.marketsScroll}>
                {markets.map(({ key, state, label }) => (
                    <div key={key} style={styles.marketSection}>
                        <div style={styles.marketLabel}>
                            {key.startsWith('live') ? '🔴' : '📊'} {label}
                            {key.startsWith('live') && (
                                <span style={styles.poolBadge}>
                                    Pool: {(Number(state.totalPool) / 1e18).toFixed(2)}
                                </span>
                            )}
                        </div>
                        {players.map((p) => {
                            const addr = p.walletAddress ?? p.id;
                            const odds = calcOdds(state, addr);
                            const payout = calcPayout(state, addr, BigInt(Math.floor(parseFloat(betAmount || '0') * 1e18)));
                            return (
                                <div key={p.id} style={styles.playerRow}>
                                    <span style={styles.playerName}>
                                        {p.name} <span style={styles.stats}>K:{p.kills} D:{p.deaths}</span>
                                    </span>
                                    <span style={styles.odds}>{odds}</span>
                                    <span style={styles.payout}>≈{payout}</span>
                                    <button
                                        style={{
                                            ...styles.betBtn,
                                            opacity: betBusy ? 0.5 : 1,
                                        }}
                                        disabled={betBusy}
                                        onClick={() => handlePlaceBet(key, addr)}
                                    >
                                        BET
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    panel: {
        position: 'fixed',
        top: 80,
        right: 12,
        width: 360,
        maxHeight: 'calc(100vh - 100px)',
        background: 'rgba(20, 12, 6, 0.92)',
        border: '2px solid rgba(242, 215, 162, 0.4)',
        borderRadius: 12,
        color: '#f9e6bd',
        fontFamily: 'Cinzel, serif',
        fontSize: 14,
        zIndex: 9000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        background: 'rgba(42, 23, 13, 0.8)',
        borderBottom: '1px solid rgba(242, 215, 162, 0.2)',
    },
    headerTitle: { fontWeight: 'bold', fontSize: 16 },
    round: { fontSize: 12, color: '#f2d9aa', opacity: 0.8 },
    collapseBtn: {
        background: 'none',
        border: 'none',
        color: '#f9e6bd',
        fontSize: 18,
        cursor: 'pointer',
        padding: '0 4px',
    },
    collapsedTab: {
        position: 'fixed',
        top: 80,
        right: 12,
        padding: '10px 18px',
        background: 'rgba(20, 12, 6, 0.9)',
        border: '2px solid rgba(242, 215, 162, 0.4)',
        borderRadius: 10,
        color: '#f9e6bd',
        fontFamily: 'Cinzel, serif',
        cursor: 'pointer',
        zIndex: 9000,
    },
    betInput: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        borderBottom: '1px solid rgba(242, 215, 162, 0.15)',
    },
    label: { fontSize: 12, whiteSpace: 'nowrap' },
    input: {
        flex: 1,
        background: 'rgba(255, 240, 209, 0.15)',
        border: '1px solid rgba(242, 215, 162, 0.3)',
        borderRadius: 6,
        color: '#fff5db',
        padding: '4px 8px',
        fontSize: 14,
        fontFamily: 'Cinzel, serif',
        textAlign: 'center',
    },
    betResult: {
        padding: '4px 14px',
        fontSize: 11,
        color: '#66bb6a',
        borderBottom: '1px solid rgba(242, 215, 162, 0.1)',
    },
    marketsScroll: {
        overflowY: 'auto',
        flex: 1,
        padding: '6px 0',
    },
    marketSection: {
        padding: '6px 14px 10px',
        borderBottom: '1px solid rgba(242, 215, 162, 0.1)',
    },
    marketLabel: {
        fontWeight: 'bold',
        fontSize: 13,
        marginBottom: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    poolBadge: {
        fontSize: 11,
        background: 'rgba(102, 187, 106, 0.2)',
        padding: '1px 6px',
        borderRadius: 4,
        color: '#66bb6a',
    },
    playerRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 0',
        fontSize: 13,
    },
    playerName: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    stats: { fontSize: 10, color: '#b8a080' },
    odds: { minWidth: 44, textAlign: 'right', color: '#ffd700', fontWeight: 'bold' },
    payout: { minWidth: 50, textAlign: 'right', color: '#66bb6a', fontSize: 11 },
    betBtn: {
        background: 'rgba(102, 187, 106, 0.3)',
        border: '1px solid rgba(102, 187, 106, 0.5)',
        borderRadius: 4,
        color: '#fff',
        padding: '2px 10px',
        cursor: 'pointer',
        fontFamily: 'Cinzel, serif',
        fontSize: 12,
        fontWeight: 'bold',
    },
};
