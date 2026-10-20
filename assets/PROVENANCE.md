# Where the assets come from

A record kept for the owner's own files, for store reviews and for any future ownership question.
Written 2026-10-20 from what the owner stated; items marked **TO CONFIRM** need the owner's check.

## Audio (music and sound effects)

- `assets/sounds/*.mp3` (the original sound effects and `background-music.mp3`, in the repository since
  the first commits) and `assets/sounds/generated/` (about 60 music tracks and many sound effects).
- **Produced with AI tools**, as stated by the owner: ChatGPT (through Codex), Gemini (through Antigravity)
  and Claude. Which file came from which tool is not recorded.
- No recording, sample or track from a third-party library is known to be included.
- Things to keep in mind:
  - Check, for each of these services, the terms in force when the files were generated: they say who owns
    the output and whether commercial use is allowed. Keep a copy or screenshot of those terms.
  - Material that is purely AI generated may get little or no copyright protection in some countries
    (for example the US Copyright Office requires human authorship). Do not expect exclusive rights over
    these audio files the way you have over the code and the game as a whole.
  - Google Play asks developers to disclose AI-generated content where it applies. Say so in the listing.
- **TO CONFIRM:** whether any prompt asked for "in the style of" a named artist or song. Remove such files.

## Images

- `assets/images/icon.png`, `adaptive-icon.png`, `splash-icon.png`, `favicon.*`, `gold_block.png`,
  `green_block.png`, `purple_block.png`: in the repository since the first commits.
  **TO CONFIRM:** drawn by the owner or generated with an AI tool (which one).
- The pixel icons (`components/PixelIcon.tsx`, `constants/UiGlyphs.ts`) are bitmaps written in code.
- Screenshots in `docs/screenshots/` are screenshots of the game itself.

## Fonts

Third-party, SIL Open Font License 1.1: see `assets/fonts/FONT_LICENSES.txt`.

## Code

Written by the owner with AI coding assistants; commits Claude helped with carry a `Co-Authored-By: Claude`
trailer in the git history. The owner directs the work, reviews it and decides what ships. Open-source
libraries keep their own licenses: see `THIRD_PARTY_NOTICES.md`.
