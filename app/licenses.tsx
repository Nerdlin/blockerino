import React from "react";
import LegalPage, { LegalBullet, LegalHeading, LegalMono, LegalParagraph } from "@/components/LegalPage";

// The short, human version of THIRD_PARTY_NOTICES.md (which is generated from the real dependency list).
export default function Licenses() {
	return (
		<LegalPage title="Licenses & credits">
			<LegalHeading>Blockerino</LegalHeading>
			<LegalParagraph>© 2025–2026 Nerdlin. All rights reserved.</LegalParagraph>

			<LegalHeading>Fonts</LegalHeading>
			<LegalParagraph>All fonts are used unmodified under the SIL Open Font License 1.1 (openfontlicense.org).</LegalParagraph>
			<LegalBullet>Press Start 2P: Copyright 2012 The Press Start 2P Project Authors (cody@zone38.net).</LegalBullet>
			<LegalBullet>Silkscreen: Copyright 2001 The Silkscreen Project Authors (github.com/googlefonts/silkscreen).</LegalBullet>
			<LegalBullet>Pixelify Sans: Copyright 2021 The Pixelify Sans Project Authors (github.com/eifetx/Pixelify-Sans).</LegalBullet>
			<LegalBullet>Space Mono: Copyright 2016 Google Inc.</LegalBullet>

			<LegalHeading>Open-source libraries</LegalHeading>
			<LegalParagraph>
				Blockerino is built with React Native, Expo, React, Jotai, Supabase JS, Reanimated, Gesture Handler, the
				Discord Embedded App SDK and other open-source libraries, mostly under the MIT license (some under BSD,
				ISC or Apache-2.0). The complete list with versions and licenses is in THIRD_PARTY_NOTICES.md in the
				project repository (github.com/Nerdlin/blockerino).
			</LegalParagraph>

			<LegalHeading>chess.js</LegalHeading>
			<LegalMono>
				{`Copyright (c) 2025, Jeff Hlywa (jhlywa@gmail.com)
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`}
			</LegalMono>

			<LegalHeading>Music and sound effects</LegalHeading>
			<LegalParagraph>
				The music and sound effects of Blockerino were produced with AI tools. No recordings from third-party sound
				libraries are included.
			</LegalParagraph>

			<LegalHeading>Services</LegalHeading>
			<LegalParagraph>
				Accounts and data run on Supabase. Sign-in uses Discord and Google. Builds, updates and push delivery use Expo
				and Firebase Cloud Messaging. These are independent services; Blockerino is not affiliated with or endorsed
				by them.
			</LegalParagraph>
		</LegalPage>
	);
}
