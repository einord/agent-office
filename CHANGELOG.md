# Changelog

## [0.1.23](https://github.com/einord/agent-office/compare/agent-office-v0.1.22...agent-office-v0.1.23) (2026-02-08)


### Bug Fixes

* differentiate reap timeouts and align stats with visible agents ([c0550e8](https://github.com/einord/agent-office/commit/c0550e83bdf52da21f0b360f9c1dd010f70fcf4d))
* reap done agents after 5-minute timeout ([267dcf8](https://github.com/einord/agent-office/commit/267dcf8cdfd73fb0ad21b2c4d230d5bdf66dd6f3))
* reap done agents after 5-minute timeout ([b68d982](https://github.com/einord/agent-office/commit/b68d982f113e75283222183fff0571edf409c8cf))

## [0.1.22](https://github.com/einord/agent-office/compare/agent-office-v0.1.21...agent-office-v0.1.22) (2026-02-08)


### Bug Fixes

* tighten session discovery window and exclude done agents from stats ([61c1cc8](https://github.com/einord/agent-office/commit/61c1cc8f87f254b602b30bd7f2a5e121c9828c6f))

## [0.1.21](https://github.com/einord/agent-office/compare/agent-office-v0.1.20...agent-office-v0.1.21) (2026-02-08)


### Bug Fixes

* correct stats counting and prevent zombie sub-agent re-discovery ([33c6b68](https://github.com/einord/agent-office/commit/33c6b6829e59ae41b70147cad1a8d3336bae3274))

## [0.1.20](https://github.com/einord/agent-office/compare/agent-office-v0.1.19...agent-office-v0.1.20) (2026-02-08)


### Features

* Add Watchtower auto-updates for CLI Docker client ([2681f8f](https://github.com/einord/agent-office/commit/2681f8fe818bf44d8e763bc776126fa13d519133))
* **gui:** Add auto-reload on new version detection for web client ([e3fa4b1](https://github.com/einord/agent-office/commit/e3fa4b1335e47461265cc3a5e44b15ce7ab45751))
* **gui:** Add auto-reload on new version detection for web client ([ddf2882](https://github.com/einord/agent-office/commit/ddf288273b7eee803301f6f675c70f436af3f6b7))
* **gui:** add typing animation for agents at workstations ([87c88f8](https://github.com/einord/agent-office/commit/87c88f88e916aae200262012554e601e28e57e29))


### Bug Fixes

* **gui:** address code review feedback for auto-reload feature ([4fb7a6f](https://github.com/einord/agent-office/commit/4fb7a6ffebc24c7d0eb237f4e68f4b71f5c2a097))
* **gui:** Address code review feedback for auto-reload feature ([cef352c](https://github.com/einord/agent-office/commit/cef352c4fe1f83b622c37bdfb3b0bf8aed64d474))
* **gui:** defer typing animation until chair transition completes ([fccb3b4](https://github.com/einord/agent-office/commit/fccb3b46eeb58ebcb9cb5b4c43a4f5c42634cce9))
* **gui:** ensure typing animation plays only when seated after chair transition ([2832b3d](https://github.com/einord/agent-office/commit/2832b3ddc6315d63e126212980b616940997892a))
* session lifecycle and stats counting ([ec1dee0](https://github.com/einord/agent-office/commit/ec1dee01e02e8c66ad2bed7942b05340b393c9c7))
* session lifecycle and stats counting ([273e422](https://github.com/einord/agent-office/commit/273e422703ccd1b5c3023c04b3cd55d1836c4e04))


### Miscellaneous

* add BUILD_TIMESTAMP to CI and docker-compose ([92154b5](https://github.com/einord/agent-office/commit/92154b5959e0f8e84ae91633ff6a97255276ee6c))

## [0.1.19](https://github.com/einord/agent-office/compare/agent-office-v0.1.18...agent-office-v0.1.19) (2026-02-07)


### Bug Fixes

* Prevent CPU spikes from unbounded file-watcher refresh cycles ([f99bf62](https://github.com/einord/agent-office/commit/f99bf626796f6d9cedb62fdaac3bb8998773a00f))

## [0.1.18](https://github.com/einord/agent-office/compare/agent-office-v0.1.17...agent-office-v0.1.18) (2026-02-06)


### Features

* Add vacuum sprite assets and implement color handling for cans ([45b10c7](https://github.com/einord/agent-office/commit/45b10c737f967e9444bf2d00e414b2e136499ec5))
* Implement cleaning service with can counting and vacuum functionality ([6e0651c](https://github.com/einord/agent-office/commit/6e0651c75518f822235aa11de31d7a2383d86506))
* Implement idle action system for agents ([be01698](https://github.com/einord/agent-office/commit/be01698dbe9d2dc5dca3c4154054403f8fdc65c5))


### Bug Fixes

* Adjust hold offset calculations and add pause timer for vacuum pickup ([70cc0a0](https://github.com/einord/agent-office/commit/70cc0a0d19eb1be12a47bd31c3ee4703b5298ac3))


### Code Refactoring

* Simplify can collection logic and improve target selection for vacuum ([aa1c0e7](https://github.com/einord/agent-office/commit/aa1c0e765d847cff20a9bc2f217ea4856ab55b50))

## [0.1.17](https://github.com/einord/agent-office/compare/agent-office-v0.1.16...agent-office-v0.1.17) (2026-02-06)


### Features

* add activity tracking to agents and integrate activity bubble animations ([fba8d29](https://github.com/einord/agent-office/commit/fba8d29b85b06fe64c10a405d5b65bd35c55087d))


### Bug Fixes

* add conflict handling to RequestResult and update response structure in ServerClient ([a7befa3](https://github.com/einord/agent-office/commit/a7befa3b638a152a54c3af8cb02312fcf5ca20fa))
* enhance token usage calculation by including cache token metrics ([6d5def3](https://github.com/einord/agent-office/commit/6d5def36f0339f6892119a4032ca69bea2c42e1c))

## [0.1.16](https://github.com/einord/agent-office/compare/agent-office-v0.1.15...agent-office-v0.1.16) (2026-02-06)


### Features

* update documentation to reflect new backend sync logic and enhanced workstation system ([3dba492](https://github.com/einord/agent-office/commit/3dba4927dd0b2845797af635fd767ab3b8165561))


### Bug Fixes

* update inactivity timeout to 180 seconds in config.json ([7d9893a](https://github.com/einord/agent-office/commit/7d9893a06058580e6326ccf4b5a5dc0e8eeeff84))


### Code Refactoring

* improve token management and session handling logic ([38d953a](https://github.com/einord/agent-office/commit/38d953a29c260628e70dcc0ae341236a3049ef78))

## [0.1.15](https://github.com/einord/agent-office/compare/agent-office-v0.1.14...agent-office-v0.1.15) (2026-02-06)


### Features

* add context progress bar to agent scene and update related logic ([333f7b2](https://github.com/einord/agent-office/commit/333f7b28b77ac17b90b49b517d8d9f6a3647a8b1))
* add getContextWindowUsage function and update token usage calculation in ClaudeMonitor ([7f56a38](https://github.com/einord/agent-office/commit/7f56a38309f0464593998550a92c1b68a0e87903))
* add viewer count functionality and UI overlay ([8ac8f47](https://github.com/einord/agent-office/commit/8ac8f47ce03b59c893c5435dd73466b9a55717e7))
* add viewer count functionality and UI overlay ([423c7a0](https://github.com/einord/agent-office/commit/423c7a0945d7890c4ed2ea97e384464273e9f363))
* **gui:** add grace period before agent transitions to idle ([5dea258](https://github.com/einord/agent-office/commit/5dea258fd6ec97e35ee9e6890d090de092390eed))
* **gui:** add grace period before agent transitions to idle ([4df9b9d](https://github.com/einord/agent-office/commit/4df9b9d4bc4ca7805c860e0802ee696fd65a4e7d))
* implement chair animations and integrate chair objects into the agent scene ([02760ff](https://github.com/einord/agent-office/commit/02760ff8dfae70d5077c30c8c247a23c2ebb79a7))
* implement preferred workstation logic for agents ([a31f8d1](https://github.com/einord/agent-office/commit/a31f8d11b5e7c92254e3de8aa0a846e3bb33647f))
* update agent animations to include 'up' and 'down' states for improved movement responsiveness ([b269dd7](https://github.com/einord/agent-office/commit/b269dd730f9336a20e6f4d0d982b0d6c2d214f9a))


### Bug Fixes

* allow multiple concurrent sessions per user in stats overlay ([70c3e67](https://github.com/einord/agent-office/commit/70c3e67398652e1f5067556026b9a532d9c28829))
* filter stale sessions from user stats overlay ([83a9dbb](https://github.com/einord/agent-office/commit/83a9dbb1249791ddd2693671b763e2850e782fad))
* filter stale sessions from user stats overlay ([ee47574](https://github.com/einord/agent-office/commit/ee47574b58d2c0f0705db1907f741e71a0ec4d17))
* use parent name for junior agents ([cdc4904](https://github.com/einord/agent-office/commit/cdc4904dfd0e8033e5b60c2067828ffb87baccb0))
* use parent name for junior agents instead of unique name ([51fe95a](https://github.com/einord/agent-office/commit/51fe95a226d453145664d3bd85759ae8b633e860))


### Documentation

* update CLAUDE.md files with missing key files and sections ([b4dfb92](https://github.com/einord/agent-office/commit/b4dfb9261c80ff3f1d315284d47eac976fbc5d15))

## [0.1.14](https://github.com/einord/agent-office/compare/agent-office-v0.1.13...agent-office-v0.1.14) (2026-02-05)


### Bug Fixes

* replace change_state with _enter_state for initial agent state ([b21a96c](https://github.com/einord/agent-office/commit/b21a96cf1382af0786b05a4b7710b805124b3ec5))

## [0.1.13](https://github.com/einord/agent-office/compare/agent-office-v0.1.12...agent-office-v0.1.13) (2026-02-05)


### Features

* add context percentage to agent management and UI elements ([c00c053](https://github.com/einord/agent-office/commit/c00c0536a0d8c33e009a4769c6f522d8fb0aa272))
* add jr suffix for sidechain agents ([8057910](https://github.com/einord/agent-office/commit/8057910b4a5178620a5d8579e8c4b5e38a868a4c))
* add jr suffix for sidechain agents and J key for testing ([f18d2bd](https://github.com/einord/agent-office/commit/f18d2bd13ce5e878e121a08ed26cbdb0df46af1a))
* add new agent variants and update sprite regions for improved animations ([58032cf](https://github.com/einord/agent-office/commit/58032cff2cd52e665e6702c989e7c0547997e4c6))
* add new computer and workstation functionality with associated sprites and scenes ([e88b152](https://github.com/einord/agent-office/commit/e88b1523de8f6457f298379f39b34b349f083c4e))
* add toggle between minimal and expanded mode for user stats overlay ([6a2a7b2](https://github.com/einord/agent-office/commit/6a2a7b2ba7d46ccc4597ac6f0e2fbf56401d5296))
* add user stats overlay with toggle views ([0da616d](https://github.com/einord/agent-office/commit/0da616d087edf5ca573ae5b142ea91cecc3f6179))
* enhance agent behavior with group management and workstation preference logic ([fab21b4](https://github.com/einord/agent-office/commit/fab21b4d7d1e8093a1d4e8d8abcff36c1d1e7b4f))
* more objects and context progress bar ([55b058d](https://github.com/einord/agent-office/commit/55b058d628ab95c15ca9ff8c87d8ca3e8869b87c))
* update tilemap and tileset with new desk positions and sprite adjustments ([737ee10](https://github.com/einord/agent-office/commit/737ee1051ff755613679d9675083048cef072497))
* use GridContainer for aligned column layout in expanded stats view ([24ad731](https://github.com/einord/agent-office/commit/24ad7316ad34434aebe7a73c8c068d2d5935d7ee))


### Code Refactoring

* address code review feedback ([37d6335](https://github.com/einord/agent-office/commit/37d63355dca5885bb9c978791f0560d22a2f424a))


### Documentation

* add conventional commits guidelines to CLAUDE.md ([9cb9a83](https://github.com/einord/agent-office/commit/9cb9a83d65ff5172360f76f48a6d71a7065f2f6e))
* add testing shortcuts and hot-reload gotcha to GUI docs ([7aed488](https://github.com/einord/agent-office/commit/7aed4880cddd68063381f420a7f9f4e5ddd2fc1c))
* update CLAUDE.md files with current architecture ([977c6e1](https://github.com/einord/agent-office/commit/977c6e1c1a71fc2e27633d133485950d78ae07ac))

## [0.1.12](https://github.com/einord/agent-office/compare/agent-office-v0.1.11...agent-office-v0.1.12) (2026-02-05)


### Features

* add context to error messages in readFirstLine ([5b7630b](https://github.com/einord/agent-office/commit/5b7630b127bf3cb4769e38992edfd16f7ae10ba0))
* add DPI-aware font scaling for high-density displays ([63bc810](https://github.com/einord/agent-office/commit/63bc810e8b717d7b56af26d7a2f78020070df6f8))
* add DPI-aware font scaling for high-density displays ([c95939d](https://github.com/einord/agent-office/commit/c95939d82f5d0afe41effbacd348a9787b690899))
* add sidechain (sub-agent) detection and visual indicator ([7b3e9f5](https://github.com/einord/agent-office/commit/7b3e9f536ad77865d9c89ecb1869723e43ffb0d7))
* add sidechain (sub-agent) detection and visual indicator ([fdbb77d](https://github.com/einord/agent-office/commit/fdbb77d3165af7e7afbe9cba66cc8add06124eeb))
* refactor URLs to use variable placeholders and improve sprite variant selection logic ([4c25d52](https://github.com/einord/agent-office/commit/4c25d524cd4a606119979f2078cde036926465d0))


### Bug Fixes

* eliminate race condition and improve cleanup order ([5ab23ff](https://github.com/einord/agent-office/commit/5ab23ff5d62b892609915557a951ea6eae85d113))
* ensure proper stream cleanup in readFirstLine ([3a4de58](https://github.com/einord/agent-office/commit/3a4de5805ee4e234d9ccb51a2f6c2fd5664681f9))
* improve error handling to prevent double rejection ([519df52](https://github.com/einord/agent-office/commit/519df52526628f3f86e11bc547c94574d38c68f0))
* remove unused import and fix stream closing ([b549f12](https://github.com/einord/agent-office/commit/b549f12b0af9386bc388f36c012e3d738bce6a9a))


### Code Refactoring

* improve efficiency and code clarity in session-reader ([aa582f0](https://github.com/einord/agent-office/commit/aa582f0e567ee9b55d5242420e9eba603a263a2d))
* simplify error handling and avoid redundant cleanup ([53c5e23](https://github.com/einord/agent-office/commit/53c5e23aff1700430ef2818f95b22b36226c14b3))
* simplify handleClose logic ([7610097](https://github.com/einord/agent-office/commit/76100977ac201c464462e62ca780d08aaf8b4864))


### Documentation

* add CLAUDE.md project instructions ([7e819a2](https://github.com/einord/agent-office/commit/7e819a2f7dfc85db0a2cb46dec04a58945ba05b0))
* add CLAUDE.md project instructions for Claude Code ([5bbae7f](https://github.com/einord/agent-office/commit/5bbae7fb336099817f067f0068a94ecfc2dcd73c))
* add gui/CLAUDE.md and document gui development ([878f0f0](https://github.com/einord/agent-office/commit/878f0f08cea9fd9904f01f4545bfeb19c8cddb2a))

## [0.1.11](https://github.com/einord/agent-office/compare/agent-office-v0.1.10...agent-office-v0.1.11) (2026-02-04)


### Features

* add animations for standing and walking states in agent ([8b2233a](https://github.com/einord/agent-office/commit/8b2233a7f20fafee846889435c09f364e407e175))

## [0.1.10](https://github.com/einord/agent-office/compare/agent-office-v0.1.9...agent-office-v0.1.10) (2026-02-04)


### Features

* enhance token management and improve agent creation logging ([0c21d4e](https://github.com/einord/agent-office/commit/0c21d4ea1413c686690ab57e65d36b1cbb67edaa))
* use generated names for displayName in ServerClient requests ([54af414](https://github.com/einord/agent-office/commit/54af414de614db4d2a9eec820f3f8f7344091c78))


### Documentation

* simplify README to focus on Docker installation ([4582720](https://github.com/einord/agent-office/commit/45827204fae8e07af26d64739145f42b79ab6013))


### Miscellaneous

* remove npm publishing from release workflow ([79772ad](https://github.com/einord/agent-office/commit/79772ad511411cc7447c69d98a5106024cb591e0))
* use local builds in docker-compose files ([bbe5991](https://github.com/einord/agent-office/commit/bbe5991ec9689788cd93ccbaf70b4ccf9351ea40))

## [0.1.9](https://github.com/einord/agent-office/compare/agent-office-v0.1.8...agent-office-v0.1.9) (2026-02-04)


### Features

* add display name to agents and update agent name scene configuration ([3f47107](https://github.com/einord/agent-office/commit/3f47107d054d8553e1c18e3256aca9d3e24cc47b))
* add new agent variants and update game scene references ([ee9221d](https://github.com/einord/agent-office/commit/ee9221d9e91c552ff7958ce3822c14fae798ab1c))
* enhance name label setup with dynamic text formatting for display and user names ([cbb1f5c](https://github.com/einord/agent-office/commit/cbb1f5c396f58910fa2f8348315432ca5aa38b0b))
* implement dynamic agent name label and update viewport configuration ([636bfa9](https://github.com/einord/agent-office/commit/636bfa958738f84d2d6182c46ddeeb08de633d21))


### Bug Fixes

* add missing window/stretch/mode configuration for viewport ([d61e6b6](https://github.com/einord/agent-office/commit/d61e6b6e780aa5abd8d6623afe2b067cfaa7cc45))
* adjust label position calculation and update scene hierarchy for viewport ([acc12be](https://github.com/einord/agent-office/commit/acc12becb4b75009284aa425f885fa327c127786))

## [0.1.8](https://github.com/einord/agent-office/compare/agent-office-v0.1.7...agent-office-v0.1.8) (2026-02-04)


### Features

* support multiple WebSocket clients simultaneously ([265fe6b](https://github.com/einord/agent-office/commit/265fe6bc95e82c9379a085f6c43d1c4841f2b105))


### Bug Fixes

* allow WebSocket reconnection on page reload ([4cb05ef](https://github.com/einord/agent-office/commit/4cb05ef5ea7b8296739d00909bf31c48dc7f0391))
* improve config loading with better error messages ([ab8a4bc](https://github.com/einord/agent-office/commit/ab8a4bcf840a79bb1282242e75ffaa648fb8a89e))

## [0.1.7](https://github.com/einord/agent-office/compare/agent-office-v0.1.6...agent-office-v0.1.7) (2026-02-04)


### Features

* add Docker deployment for backend + Godot web UI ([d1112a5](https://github.com/einord/agent-office/commit/d1112a5d60d819b9f6eec807e75d6b41158a9600))
* enhance server-client error handling with detailed request results ([431f255](https://github.com/einord/agent-office/commit/431f2559b1cb7d60f0e590037b13bc751f87945a))
* implement incremental reading for conversation files and enhance session management ([7564b1a](https://github.com/einord/agent-office/commit/7564b1a88e89bb91dc1d4c7d2f35ca10fd18e5b3))

## [0.1.6](https://github.com/einord/agent-office/compare/agent-office-v0.1.5...agent-office-v0.1.6) (2026-02-04)


### Features

* update .env.example and docker-compose.yml for local development support ([e9e0d41](https://github.com/einord/agent-office/commit/e9e0d4168ed6c66782395f3f0d5df5b0d828ee5a))
* update user configuration and enhance server-client error handling ([46e2be4](https://github.com/einord/agent-office/commit/46e2be4e6b4cb76afb14104ae29cf2bdb806fda7))

## [0.1.5](https://github.com/einord/agent-office/compare/agent-office-v0.1.4...agent-office-v0.1.5) (2026-02-04)


### Features

* add agent spawning and exit handling functionality ([df7078e](https://github.com/einord/agent-office/commit/df7078e17ec744e6eca09d9399347194db507241))
* add backend build process and update release configuration ([1d90e2e](https://github.com/einord/agent-office/commit/1d90e2e55d64436d683bebcf010c834d2d6bb18c))
* add backend for Agent Office Monitor ([3f6e532](https://github.com/einord/agent-office/commit/3f6e532a7c40a1166c60adbef963992d2ac0d8d6))
* add multiple agent sprite variants and update agent spawning logic ([b30e4b1](https://github.com/einord/agent-office/commit/b30e4b1be097b402112c0b03454a190414cb2aa6))
* enhance agent navigation with state management and add workstations and break areas to tilemap ([250537d](https://github.com/einord/agent-office/commit/250537dec6e22c6f041edbe6ab2af6a4c6e5305f))
* enhance session rendering with improved activity handling and add README documentation ([51a555b](https://github.com/einord/agent-office/commit/51a555bf2edc8d28c172dfcb709b62ffe4db97d6))
* implement agent synchronization with backend and enhance agent management features ([94adb70](https://github.com/einord/agent-office/commit/94adb7092aaf9de9625d69f6a920a046706f11ab))
* implement Docker support with multi-stage builds and log-based UI for session monitoring ([0585112](https://github.com/einord/agent-office/commit/058511282f97a17b54fe70e674f578e751f504dd))
* implement idle state timer for improved agent behavior during idle periods ([bfaefd9](https://github.com/einord/agent-office/commit/bfaefd9e383d33f2d06a0f87518f79a26116fb91))
* implement inactivity management for agents and add heartbeat endpoint ([c2dde3c](https://github.com/einord/agent-office/commit/c2dde3cad37ef8107785610ac469e41a04dfb52e))
* update navigation and collision settings in agent and tilemap scenes ([986ac7d](https://github.com/einord/agent-office/commit/986ac7d76bef9339b73d157b604832fc744cb638))


### Bug Fixes

* adjust movement speed and enhance navigation target selection logic ([aeaccce](https://github.com/einord/agent-office/commit/aeaccce31ec32f08049d135d39ced0f7605a1551))
* remove debug print statements from navigation process ([f8610ec](https://github.com/einord/agent-office/commit/f8610ecb33828c748ad5ef8a1193ac9fdb898c42))
* update agent and tilemap scene structure for improved hierarchy and navigation ([06271ca](https://github.com/einord/agent-office/commit/06271ca06e848142cae6067adb2d9cae8edc1160))
* update version to 0.1.5 in package.json ([d8f6425](https://github.com/einord/agent-office/commit/d8f6425acde5ebc49e14e2799e971e910572cfa3))

## [0.1.4](https://github.com/einord/agent-office/compare/agent-office-v0.1.3...agent-office-v0.1.4) (2026-02-03)


### Bug Fixes

* release-script issues ([ca933a0](https://github.com/einord/agent-office/commit/ca933a066b09b442a026fb14ef738f2bc9e0d96b))
* update Node.js version and pkg target in release workflow ([b53a300](https://github.com/einord/agent-office/commit/b53a30031b1b58121fa7c7b21dbf7445be97e1e3))

## [0.1.3](https://github.com/einord/agent-office/compare/agent-office-v0.1.2...agent-office-v0.1.3) (2026-02-03)


### Bug Fixes

* update output references in release-please workflow ([3aacb88](https://github.com/einord/agent-office/commit/3aacb88e9c80ccc84dbb62effaa02c3a290d28e3))
* update release-please outputs and configuration for consistency ([8cfe943](https://github.com/einord/agent-office/commit/8cfe94332ba5a985bd99d6a83e121aa35b6cb956))
