import { PieceData } from "@/constants/Piece";
import { View } from "react-native";
import SkinnedBlock from "./SkinnedBlock";
import { shopStateAtom } from "@/constants/Shop";
import { useAtomValue } from "jotai";

export function PieceView({piece, blockSize, style}: {piece: PieceData, blockSize: number, style?: any}) {
    const pieceHeight = piece.matrix.length;
    const pieceWidth = piece.matrix[0].length;
    const pieceBlocks = [];
    const pieceSkinId = useAtomValue(shopStateAtom).equipped.piece_skin;

    for (let y = 0; y < pieceHeight; y++) {
        for (let x = 0; x < pieceWidth; x++) {
            if (piece.matrix[y][x] === 1) {
                const blockStyle = {
                    width: blockSize,
                    height: blockSize,
                    top: y * blockSize,
                    left: x * blockSize,
                    position: "absolute",
                    opacity: 0.8,
                };
                pieceBlocks.push(
                    <SkinnedBlock
                        key={`${x},${y}`}
                        color={piece.color}
                        size={blockSize}
                        skinId={pieceSkinId}
                        borderWidth={blockSize / 4}
                        style={blockStyle}
                    />,
                );
            }
        }
    }

    return <View style={[{
        width: pieceWidth * blockSize,
        height: pieceHeight * blockSize
    }, style]}>
        {pieceBlocks}
    </View>
}
