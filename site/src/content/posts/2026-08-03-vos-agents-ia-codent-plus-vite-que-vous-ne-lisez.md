---
title: "Vos agents IA codent plus vite que vous ne lisez"
date: "2026-08-03"
description: "Coding agents produisent du code toujours plus vite, mais la vélocité réelle des équipes ne suit pas. Le vrai levier : la précision des specs, la structure des données et le harnais qu'on construit autour du modèle."
tags: ["ai", "agents", "productivite"]
image: "2026-08-03.webp"
kind: "veille"
---

# Vos agents IA codent plus vite que vous ne lisez. Alors pourquoi la vélocité ne suit pas ?

Un agent peut aujourd'hui produire cinquante lignes de code, ou huit fichiers avec des tests qui passent, en quelques secondes. Et pourtant, un développeur senior en grande entreprise ne récupérerait qu'environ 1h15 par jour grâce à l'IA, soit à peine 15 % de sa journée. Si la génération de code est devenue quasi gratuite, où part vraiment le temps qu'on pensait gagner ?

### Le vrai goulot, c'est la précision de la demande

Un exemple raconté par un formateur ayant testé la question sur un projet volontairement flou : un simple outil de feedback hebdomadaire pour des projets, sans préciser qui l'utiliserait ni comment. Donné tel quel à un agent de codage, l'idée a débouché sur un outil en ligne de commande pour suivre l'avancement de projets, complet avec documentation et 62 tests qui passaient tous [[5](https://open.substack.com/pub/alexeyondata/p/ai-native-development-specifications?utm_source=multiple-personal-recommendations-email&utm_medium=email&token=eyJ1c2VyX2lkIjo0NzU1OTI2MjgsInBvc3RfaWQiOjIwODAxNzIwNCwiaWF0IjoxNzg1NzAxMTE0LCJleHAiOjE3ODgyOTMxMTQsImlzcyI6InB1Yi03MTU0OTQwIiwic3ViIjoicG9zdC1yZWFjdGlvbiJ9.RHnPSaHdT3Wb4tB-UlUpRDlmvoKiDVLGof4HL8JTibM)]. Rien à redire sur la qualité du résultat, sauf que ce n'était pas du tout ce qu'il fallait construire : un outil web de rétrospective d'équipe, pas un tracker en CLI. La leçon n'est pas que l'agent a mal compris, c'est que la demande de départ n'avait jamais été assez précise pour qu'il n'ait pas à deviner. D'où l'idée de découper le travail en rôles (product manager, ingénieur, QA) avant même d'écrire une ligne, pour que la spécification absorbe l'ambiguïté avant que le code ne la fige.

### Ce qu'on garde, c'est la structure, pas la syntaxe SQL

Même bascule côté données. Le fondateur de dbt Labs, dont l'outil équipe plus de 100 000 équipes data dans le monde, avance une idée à contre-courant : si une IA peut désormais écrire les requêtes SQL à la place d'un analytics engineer, ce métier ne perd pas en importance, il en change [[0](https://open.substack.com/pub/dataanalysis/p/when-ai-builds-the-data-models?utm_source=multiple-personal-recommendations-email&utm_medium=email&token=eyJ1c2VyX2lkIjo0NzU1OTI2MjgsInBvc3RfaWQiOjIwODkxNTcwOSwiaWF0IjoxNzg1NzAxMTE0LCJleHAiOjE3ODgyOTMxMTQsImlzcyI6InB1Yi01NjY3MSIsInN1YiI6InBvc3QtcmVhY3Rpb24ifQ.bVLEFY_MGyWWtDBQLxIZWbH1bwxZ7iYUJOUuD2KP32I)]. Le code lui-même devient invisible : on peut demander un modèle de données sans jamais toucher au SQL sous-jacent. Mais définir la logique métier, la tester, la documenter, la versionner : tout ça compte plus qu'avant, parce qu'un agent a besoin exactement des mêmes garde-fous qu'un humain pour produire quelque chose de fiable.

### Le modèle, on le loue. Ce qui l'entoure, on le possède

C'est là qu'intervient une idée qui circule depuis peu sous le nom de « harness engineering ». La formule qui résume tout : un agent, c'est un modèle plus un harnais. Le modèle, c'est le LLM. Le harnais, c'est tout le reste — la boucle de décision, les outils, le bac à sable, l'assemblage du contexte, les permissions, les tests à passer, l'état qui survit à un crash, les budgets, les portes de validation. Quand le code source de Claude Code a fuité en mars, on y a compté environ 512 000 lignes de TypeScript réparties sur près de 1 900 fichiers [[9](https://programmingdigest.net/links/22857/8e384055-4ef6-4411-8656-1644e3ae163f/email)] — et la portion qui dialogue réellement avec le modèle n'en représente qu'une fraction infime. Tout le reste, c'est du harnais.

> The model is the part you rent.

On ne contrôle pas le modèle : il change de version tous les quelques mois, avec ses propres manies. On contrôle entièrement, en revanche, ce qui l'entoure. D'où une autre manière de voir les choses : un agent fiable en production repose surtout sur du code déterministe classique, avec le modèle sollicité seulement à des points de décision précis, pendant que le contrôle de boucle, l'état et le périmètre restent tenus par du code qu'on écrit soi-même [[3](https://open.substack.com/pub/bytebytego/p/best-practices-for-building-ai-agents?utm_source=multiple-personal-recommendations-email&utm_medium=email&token=eyJ1c2VyX2lkIjo0NzU1OTI2MjgsInBvc3RfaWQiOjIwNzMzMjEwMSwiaWF0IjoxNzg1NzAxMTE0LCJleHAiOjE3ODgyOTMxMTQsImlzcyI6InB1Yi04MTcxMzIiLCJzdWIiOiJwb3N0LXJlYWN0aW9uIn0.EsFI-UzdFBeSSFG48P62T4RbCzwv9nPO255Aa0jWoYo)].

Et cette mémoire, justement, est le point faible qu'on néglige le plus. Le raisonnement derrière une décision de code — pourquoi cette approche, pourquoi pas l'alternative, pourquoi ce contournement — vit dans la conversation avec l'agent, et disparaît généralement au moment du commit. Des outils commencent à apparaître pour capturer ce "pourquoi" comme une mémoire persistante, partagée entre les sessions et les agents utilisés [[8](https://programmingdigest.net/links/22856/8e384055-4ef6-4411-8656-1644e3ae163f/email)]. Encore une brique de harnais, au même titre que les specs ou les tests.

Remettons ça bout à bout : la spec absorbe l'ambiguïté, la structure de données porte les garde-fous, le harnais tient la boucle et garde le raisonnement. Rien de tout ça n'est le modèle. Et c'est peut-être bien pour ça que même avec un agent trois fois plus rapide pour écrire du code, un développeur senior ne gagne au final qu'une fraction de sa journée : la vitesse d'écriture n'a jamais été le vrai facteur limitant.

Alors la question à se poser cette semaine n'est peut-être pas "mon agent est-il assez bon", mais "qu'est-ce que j'ai vraiment construit autour de lui" ?

---

## Sources

1. [When AI Builds the Data Models, What Happens to Analytics Engineering? - Issue 326](https://open.substack.com/pub/dataanalysis/p/when-ai-builds-the-data-models?utm_source=multiple-personal-recommendations-email&utm_medium=email&token=eyJ1c2VyX2lkIjo0NzU1OTI2MjgsInBvc3RfaWQiOjIwODkxNTcwOSwiaWF0IjoxNzg1NzAxMTE0LCJleHAiOjE3ODgyOTMxMTQsImlzcyI6InB1Yi01NjY3MSIsInN1YiI6InBvc3QtcmVhY3Rpb24ifQ.bVLEFY_MGyWWtDBQLxIZWbH1bwxZ7iYUJOUuD2KP32I)
2. [Best Practices for Building AI Agents That Work in Production](https://open.substack.com/pub/bytebytego/p/best-practices-for-building-ai-agents?utm_source=multiple-personal-recommendations-email&utm_medium=email&token=eyJ1c2VyX2lkIjo0NzU1OTI2MjgsInBvc3RfaWQiOjIwNzMzMjEwMSwiaWF0IjoxNzg1NzAxMTE0LCJleHAiOjE3ODgyOTMxMTQsImlzcyI6InB1Yi04MTcxMzIiLCJzdWIiOiJwb3N0LXJlYWN0aW9uIn0.EsFI-UzdFBeSSFG48P62T4RbCzwv9nPO255Aa0jWoYo)
3. [AI-Native Development: Specifications, Loop and Graph Engineering](https://open.substack.com/pub/alexeyondata/p/ai-native-development-specifications?utm_source=multiple-personal-recommendations-email&utm_medium=email&token=eyJ1c2VyX2lkIjo0NzU1OTI2MjgsInBvc3RfaWQiOjIwODAxNzIwNCwiaWF0IjoxNzg1NzAxMTE0LCJleHAiOjE3ODgyOTMxMTQsImlzcyI6InB1Yi03MTU0OTQwIiwic3ViIjoicG9zdC1yZWFjdGlvbiJ9.RHnPSaHdT3Wb4tB-UlUpRDlmvoKiDVLGof4HL8JTibM)
4. [Harness Engineering Deep Dive: Where The Term Came From, And How To Actually Build One](https://programmingdigest.net/links/22857/8e384055-4ef6-4411-8656-1644e3ae163f/email)
5. [Jolli Memory – Knowledge that remembers your code and context](https://programmingdigest.net/links/22856/8e384055-4ef6-4411-8656-1644e3ae163f/email)
6. [The AI productivity gap](https://leadershipintech.com/links/22884/3d78f33c-7ca0-4e03-9c70-68e56918a4cd/email)

## Pour aller plus loin

- [What is really happening to jobs? Separating AI hype from reality](https://leadershipintech.com/links/22889/3d78f33c-7ca0-4e03-9c70-68e56918a4cd/email) — pour remettre l'emballement sur l'IA et l'emploi face aux données réelles
- [How LLMs Figure Out What You Mean - No Math Degree Required](https://programmingdigest.net/links/22858/8e384055-4ef6-4411-8656-1644e3ae163f/email) — pour comprendre, sans maths, ce qui se passe vraiment sous le capot d'un LLM
- [What is dbt (data build tool)?](https://open.substack.com/pub/thedatatoolbox/p/what-is-dbt-data-build-tool?utm_source=multiple-personal-recommendations-email&utm_medium=email&token=eyJ1c2VyX2lkIjo0NzU1OTI2MjgsInBvc3RfaWQiOjE5MzEwODA2MSwiaWF0IjoxNzg1NzAxMTE0LCJleHAiOjE3ODgyOTMxMTQsImlzcyI6InB1Yi0zNDIzMjk3Iiwic3ViIjoicG9zdC1yZWFjdGlvbiJ9.PC2qbNH9X65gDh-6PnX1Uxuf1mLKDtDZD26EngkP6Es) — la base avant d'aller plus loin sur le sujet des data models
- [The Economic Benefit of Refactoring](https://leadershipintech.com/links/22887/3d78f33c-7ca0-4e03-9c70-68e56918a4cd/email) — un retour d'expérience concret sur 150 000 lignes codées quasi entièrement par des agents

*Cet article a été rédigé en m'appuyant sur une IA pour m'aider à synthétiser et structurer ma veille. Les idées, le choix des sources et la relecture restent les miens.*
