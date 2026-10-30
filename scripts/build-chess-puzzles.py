"""Builds assets/chess/puzzles.json from the Lichess puzzle database (lichess_db_puzzle.csv.zst, CC0, from
database.lichess.org). It keeps a small, even spread: up to PER_BUCKET well-rated puzzles in every 100-point rating
band, short ones only, picked by a stable hash of the id so a rebuild gives the same set.

Usage: python scripts/build-chess-puzzles.py <path to lichess_db_puzzle.csv.zst> <output json>
"""
import csv
import hashlib
import io
import json
import sys

import zstandard

LOW, HIGH, STEP = 400, 2800, 100
PER_BUCKET = 25
MAX_MOVES = 8  # the opponent's setup move plus at most 4 moves to find (with the replies between them)
# themes shown in the game; the rest of Lichess's tags are left out
THEMES = {
    "mateIn1", "mateIn2", "mateIn3", "fork", "pin", "skewer", "discoveredAttack", "doubleCheck", "hangingPiece",
    "trappedPiece", "sacrifice", "promotion", "endgame", "backRankMate", "deflection", "attraction", "defensiveMove",
    "quietMove", "zugzwang", "advantage", "crushing",
}


def main(src: str, out: str) -> None:
    buckets: dict[int, list[tuple[str, list]]] = {}
    with open(src, "rb") as raw:
        reader = zstandard.ZstdDecompressor().stream_reader(raw)
        rows = csv.DictReader(io.TextIOWrapper(reader, encoding="utf-8"))
        for row in rows:
            try:
                rating = int(row["Rating"])
                if rating < LOW or rating >= HIGH:
                    continue
                if int(row["Popularity"]) < 85 or int(row["NbPlays"]) < 500 or int(row["RatingDeviation"]) > 90:
                    continue
                moves = row["Moves"].split()
                if len(moves) < 2 or len(moves) > MAX_MOVES:
                    continue
            except (KeyError, ValueError):
                continue
            bucket = (rating - LOW) // STEP
            key = hashlib.sha1(row["PuzzleId"].encode()).hexdigest()
            themes = [theme for theme in row["Themes"].split() if theme in THEMES][:3]
            entry = (key, [row["PuzzleId"], row["FEN"], row["Moves"], rating, themes])
            chosen = buckets.setdefault(bucket, [])
            # keep the PER_BUCKET smallest hashes: a stable, unbiased sample without holding the whole file
            if len(chosen) < PER_BUCKET:
                chosen.append(entry)
                chosen.sort()
            elif key < chosen[-1][0]:
                chosen[-1] = entry
                chosen.sort()
    puzzles = [entry for bucket in sorted(buckets) for _, entry in buckets[bucket]]
    puzzles.sort(key=lambda puzzle: puzzle[3])
    with open(out, "w", encoding="utf-8") as handle:
        json.dump(puzzles, handle, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(puzzles)} puzzles, ratings {puzzles[0][3]}-{puzzles[-1][3]} -> {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
