# Changelog

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
