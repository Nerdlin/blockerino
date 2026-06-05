import { getRandomPiece } from "@/constants/Piece";
import React, { useEffect, useMemo } from "react";
import { useWindowDimensions } from "react-native";
import Animated, { useSharedValue, withRepeat, withSequence, withDelay, withTiming, useAnimatedStyle } from "react-native-reanimated";
import { PieceView } from "./PieceView";

function PieceParticleComponent({
    blockSize = 28,
    maxOpacity = 1,
}: {
    blockSize?: number;
    maxOpacity?: number;
}) {
    const { width, height } = useWindowDimensions();
    
    const randomSeed = useMemo(() => ({
        xRatio: Math.random(),
        yRatio: Math.random(),
        delay: Math.random() * 5000,
        targetY: Math.random() * 50 - 150,
        piece: getRandomPiece(),
    }), []);
    const randomX = randomSeed.xRatio * width;
    const randomY = randomSeed.yRatio * height;
    const randomDelay = randomSeed.delay;

    const randomTargetX = 0;
    const randomTargetY = randomSeed.targetY;

    const opacity = useSharedValue(0);
    const translateXOffset = useSharedValue(0);
    const translateYOffset = useSharedValue(0);

    useEffect(() => {
        opacity.value = withRepeat(
            withSequence(
                withDelay(randomDelay, withTiming(maxOpacity, { duration: 1000 })),
                withTiming(0, { duration: 1000 }),
            ),
            -1,
        );

        translateYOffset.value = withRepeat(
            withSequence(
                withDelay(randomDelay, withTiming(randomTargetY, { duration: 2000 })),
                withTiming(0, { duration: 0 }),
            ),
            -1,
        );

        translateXOffset.value = withRepeat(
            withSequence(
                withDelay(randomDelay, withTiming(randomTargetX, { duration: 2000 })),
                withTiming(0, { duration: 0 }),
            ),
            -1,
        );
    }, [opacity, translateYOffset, translateXOffset, randomDelay, randomTargetY, maxOpacity]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [
            { translateY: translateYOffset.value },
            { translateX: translateXOffset.value },
        ],
    }));


    return (
        <Animated.View
            style={[
                {
                    position: "absolute",
                    left: randomX,
                    top: randomY,
                    pointerEvents: "none",
                },
                animatedStyle,
            ]}
        >
            <PieceView piece={randomSeed.piece} blockSize={blockSize}></PieceView>
        </Animated.View>
    );
}

export const PieceParticle = React.memo(PieceParticleComponent);
