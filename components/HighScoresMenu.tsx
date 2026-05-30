import { getHighScores, HighScore } from "@/constants/Storage";
import { getGlobalHighScores, GlobalHighScore } from "@/constants/Supabase";
import SimplePopupView from "./SimplePopupView";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View, ActivityIndicator, TextInput } from "react-native";
import StylizedButton from "./StylizedButton";
import { cssColors } from "@/constants/Color";
import { GameModeType, useSetAppState } from "@/hooks/useAppState";
import { submitGlobalHighScore } from "@/constants/Supabase";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from "@/constants/Theme";

export default function HighScores() {
    const { currentTheme } = useTheme();
    const [ setAppState, , popAppState ] = useSetAppState();
    const [ highScores, setHighScores ] = useState<HighScore[]>([]);
    const [ globalHighScores, setGlobalHighScores ] = useState<GlobalHighScore[]>([]);
    const [ gameMode, setGameMode ] = useState(GameModeType.Classic);
    const [ loading, setLoading ] = useState(false);
    const [ syncing, setSyncing ] = useState(false);
    const [ syncMessage, setSyncMessage ] = useState('');
    const [ playerName, setPlayerName ] = useState('Anonymous');

    useEffect(() => {
        AsyncStorage.getItem('PLAYER_NAME').then((val) => {
            if (val) {
                setPlayerName(val);
            }
        });
    }, []);

    const handlePlayerNameChange = (name: string) => {
        setPlayerName(name);
    };

    const handlePlayerNameBlur = async () => {
        const trimmedName = playerName.trim();
        const finalName = trimmedName || 'Anonymous';
        
        await AsyncStorage.setItem('PLAYER_NAME', finalName);
        
        // Auto-sync best local score if they have one
        if (highScores.length > 0) {
            setSyncing(true);
            const bestScore = highScores[0].score;
            await submitGlobalHighScore(finalName, bestScore, gameMode);
            setSyncing(false);
            
            // Refresh global leaderboard
            setLoading(true);
            const updatedScores = await getGlobalHighScores(gameMode, 10);
            setGlobalHighScores(updatedScores);
            setLoading(false);
        }
    };

    useEffect(() => {
        // Load local high scores to enable syncing
        getHighScores(gameMode, true, true, 10).then((value) => {
            setHighScores(value);
        });

        // Load global high scores
        setLoading(true);
        getGlobalHighScores(gameMode, 10).then((value) => {
            setGlobalHighScores(value);
            setLoading(false);
        });
    }, [gameMode]);

    const hasScores = globalHighScores.length > 0;

    return <SimplePopupView style={[{justifyContent: 'flex-start', backgroundColor: currentTheme.menuBackground}]}>
        <StylizedButton text="Back" onClick={popAppState} backgroundColor={cssColors.spaceGray}></StylizedButton>

        <View style={styles.nicknameContainer}>
            <Text style={[styles.subHeader, { color: currentTheme.textSecondary, fontSize: 18, marginBottom: 5 }]}>
                {"Your Nickname:"}
            </Text>
            <TextInput
                style={[styles.nicknameInput, {
                    color: currentTheme.textPrimary,
                    borderColor: currentTheme.textSecondary,
                    backgroundColor: 'rgba(0, 0, 0, 0.4)'
                }]}
                value={playerName}
                onChangeText={handlePlayerNameChange}
                onBlur={handlePlayerNameBlur}
                onSubmitEditing={handlePlayerNameBlur}
                placeholder="Enter Nickname"
                placeholderTextColor={currentTheme.textSecondary}
                maxLength={20}
            />
            {syncing && (
                <Text style={{ fontFamily: 'Silkscreen', fontSize: 12, color: currentTheme.textSecondary, marginTop: 5 }}>
                    Syncing best score...
                </Text>
            )}
        </View>

        { hasScores &&
            <>
                <Text style={[styles.subHeader, { color: currentTheme.textSecondary }]}>
                    {"Select a game mode..."}
                </Text>
                <View style={{flexDirection: 'row', gap: 10}}>
                    <StylizedButton
                        text="Classic"
                        onClick={() => { setGameMode(GameModeType.Classic) }}
                        backgroundColor={gameMode === GameModeType.Classic ? currentTheme.buttonPrimary : cssColors.spaceGray}
                    />
                    <StylizedButton
                        text="Chaos"
                        onClick={() => { setGameMode(GameModeType.Chaos) }}
                        backgroundColor={gameMode === GameModeType.Chaos ? cssColors.pitchBlack : cssColors.spaceGray}
                        borderColor={gameMode === GameModeType.Chaos ? "white" : undefined}
                    />
                </View>
                <Text style={[styles.header, { color: currentTheme.textPrimary }]}>
                    {"Global Leaderboard (Top 10)"}
                </Text>
                <Text style={[styles.subHeader, { color: currentTheme.textSecondary }]}>
                    {"Sorted from high to low."}
                </Text>

                {loading && <ActivityIndicator size="large" color={currentTheme.textPrimary} />}

                {!loading && globalHighScores.map((score, idx) => {
                    return <GlobalScore key={idx} rank={idx + 1} score={score}/>
                })}
            </>
        }
        { !hasScores && !loading &&
            <>
                <Text style={[styles.noScoresText, { color: currentTheme.textPrimary }]}>
                    {"No global scores yet. Be the first!"}
                </Text>
                <StylizedButton text="Play Classic" onClick={() => {
                    setAppState(GameModeType.Classic)
                }} backgroundColor={currentTheme.buttonPrimary}></StylizedButton>
                <StylizedButton text="Play Chaos" onClick={() => {
                    setAppState(GameModeType.Chaos)
                }} backgroundColor={cssColors.pitchBlack} borderColor="white"></StylizedButton>
            </>
        }
    </SimplePopupView>
}

function GlobalScore({score, rank}: {score: GlobalHighScore, rank: number}) {
    const { currentTheme } = useTheme();
    return <>
        <Text style={[styles.scoreValueText, { color: currentTheme.textPrimary }]}>
            {"#" + String(rank) + " - " + score.player_name + " - " + String(score.score)}
        </Text>
        <Text style={[styles.scoreTimeText, { color: currentTheme.textSecondary }]}>
            {score.created_at ? createTimeAgoString(new Date(score.created_at).getTime()) : 'Unknown time'}
        </Text>
    </>
}

function createTimeAgoString(date: number): string {
    const now = new Date();
    const seconds = Math.round((now.getTime() - date) / 1000);
    const minutes = Math.round(seconds / 60);
    const hours = Math.round(minutes / 60);
    const days = Math.round(hours / 24);
    const months = Math.round(days / 30);
    const years = Math.round(days / 365);
  
    if (seconds < 60) {
      return seconds <= 0 ? 'now' : `${seconds} seconds ago`;
    } else if (minutes < 60) {
      return `${minutes} minutes ago`;
    } else if (hours < 24) {
      return `${hours} hours ago`;
    } else if (days < 30) {
      return `${days} days ago`;
    } else if (months < 12) {
      return `${months} months ago`;
    } else {
      return `${years} years ago`;
    }
  }

const styles = StyleSheet.create({
    noScoresText: {
        color: 'white',
        fontSize: 30,
        fontFamily: 'Silkscreen',
        textAlign: 'center',
        marginBottom: 20
    },
    scoreValueText: {
        color: 'white',
        fontSize: 30,
        fontFamily: 'Silkscreen'
    },
    scoreTimeText: {
        color: 'rgb(150, 150, 150)',
        fontSize: 15,
        fontFamily: 'Silkscreen'
    },
    header: {
        color: 'white',
        fontSize: 30,
        fontFamily: 'Silkscreen'
    },
    subHeader: {
        color: 'rgb(100, 100, 100)',
        fontSize: 24,
        fontFamily: 'Silkscreen'
    },
    nicknameContainer: {
        width: '80%',
        alignItems: 'center',
        marginVertical: 15,
        gap: 5
    },
    nicknameInput: {
        width: '100%',
        fontSize: 20,
        fontFamily: 'Silkscreen',
        padding: 10,
        borderWidth: 2,
        borderRadius: 5,
        textAlign: 'center',
    }
});