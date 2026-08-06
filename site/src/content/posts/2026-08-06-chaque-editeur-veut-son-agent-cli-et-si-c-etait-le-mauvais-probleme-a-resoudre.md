---
title: "Chaque éditeur veut son agent CLI. Et si c'était le mauvais problème à résoudre ?"
date: "2026-08-06"
description: "Warp, DoorDash et Amazon sortent chacun leur agent CLI cette semaine. Mais entre le coût caché du contexte, les PR géantes à relire et des benchmarks IA saturés, progresse-t-on vraiment ?"
tags: ["ai", "agents", "devtools", "benchmarks"]
image: "2026-08-06.webp"
kind: "veille"
---

# Chaque éditeur veut son agent CLI. Et si c'était le mauvais problème à résoudre ?

Il s'est passé quoi cette semaine ? Trois boîtes qui n'ont rien à voir entre elles — un éditeur de terminal, une appli de livraison de repas et un fournisseur cloud — ont sorti chacune leur propre agent en ligne de commande. Pendant ce temps, une étude montre que près de la moitié des benchmarks qu'on utilise pour juger ces modèles ne servent plus à rien. Drôle de semaine pour prétendre qu'on avance vite et qu'on sait mesurer où on va.

### Tout le monde sort son CLI

Warp a dégainé son Agent CLI, utilisable dans n'importe quel terminal — Ghostty, iTerm2, VS Code, le terminal Windows ou Mac [[1](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fwww.warp.dev%2Fblog%2Fintroducing-the-warp-agent-cli-coding-agent%3Futm_source=tldrdev/1/0100019fd1a45d53-e17d9fff-1c81-41cc-b713-a381aabd6776-000000/zmQlkjt4WTwHVafEoBNalkAsRMSj5znizL-jMKbans0=452). L'argument : leur infrastructure terminal permet de faire tourner plusieurs sessions d'agents en parallèle, un peu comme tmux le fait pour des shells classiques.

DoorDash, de son côté, a lancé `dd-cli` — oui, une appli de livraison de repas avec sa propre ligne de commande [[2](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fwww.productcurious.com%2Fp%2Fdeep-dive-why-did-doordash-ship-a%3Futm_source=tldrdev/1/0100019fd1a45d53-e17d9fff-1c81-41cc-b713-a381aabd6776-000000/IQ99TvvFD3tvykh7AYhL9-Kc3-AzJYfeqtNoR50yiOk=452). Le déclencheur remonte à une note d'analyste évoquant le risque qu'un agent IA choisisse un concurrent moins cher à la place de l'utilisateur humain fidèle à l'appli. Le CTO a répondu en public, puis a fini par livrer un CLI qui laisse l'agent agir sans étape de confirmation humaine avant un paiement — un choix de conception qui en dit long sur la course en cours.

> « La livraison de repas vit de marges minces ; elle tient en possédant la relation client et en vendant de la pub autour. »

C'est à peu près l'argument que reprend Gergely Orosz pour expliquer pourquoi ce genre d'acteur évite d'habitude d'ouvrir une API — et pourquoi le CLI change la donne.

Amazon, enfin, a ouvert Kiro Crew, un outil né en interne pour orchestrer plusieurs agents sur des tâches longues — triage de tickets, migration, investigation d'incident — pendant que l'humain reste joignable seulement pour les décisions qui comptent [[3](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fkiro.dev%2Fblog%2Fintroducing-kiro-crew%2F%3Futm_source=tldrai/1/0100019fd218b862-89c5c98e-d9a5-4962-84ad-5b81373ac057-000000/70dMTPh1uUI314Svwq6NytVtJUJRyXeKZMLqKFXLOyo=452).

### Sous le capot, ça coûte cher en contexte

Ce que ces CLI ne montrent pas, c'est le poids réel de chaque requête. Un développeur a mesuré ce que Codex envoyait réellement au modèle pour un prompt de 16 caractères — littéralement demander de répondre "pong" [[4](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Flinks.tldrnewsletter.com%2FHg16HJ/1/0100019fd218b862-89c5c98e-d9a5-4962-84ad-5b81373ac057-000000/9VmIYyUSUDj9AyibvxNJ9_qMsOOVo4FI1FJO3R8wvWQ=452). Résultat : une requête de plus de 42 000 octets, soit environ 9 400 tokens rien que pour charger les instructions système, les définitions d'outils et le contexte d'environnement. Le prompt lui-même ne pesait que 25 tokens, à peine 0,3 % du total. Autrement dit : avant même de faire quoi que ce soit d'utile, l'agent paie un droit d'entrée fixe, et ce droit d'entrée grossit à chaque nouvel outil qu'on lui greffe.

### Le vrai goulot d'étranglement n'est pas la génération, c'est la relecture

Plus les agents produisent vite, plus le problème se déplace vers l'humain qui doit relire. GitHub le formule bien : les agents de code sont censés apporter un gain de productivité massif sur tout le cycle de développement d'ici 2028, mais ils ne choisissent pas comment découper le travail — et livrent par défaut une seule pull request énorme et difficile à relire [[5](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fgithub.blog%2Fengineering%2Fturn-one-giant-ai-generated-pull-request-to-a-reviewable-stack%2F%3Futm_source=tldrdev/1/0100019fd1a45d53-e17d9fff-1c81-41cc-b713-a381aabd6776-000000/y20TY2Mrn0sFsGYDDSywTVKcs6EdcrcK09nNDWEHdcc=452). Leur réponse : découper automatiquement le diff en une pile de petites pull requests indépendantes, plus faciles à approuver une par une. Sur le papier ça paraît évident. Dans la pratique, ça veut dire qu'on invente encore les outils de relecture pendant que les outils de génération, eux, sont déjà là.

### Et si on ne pouvait plus savoir qui progresse vraiment ?

Dernier caillou dans la chaussure : une étude systématique sur 60 benchmarks de langage montre que 29 d'entre eux sont aujourd'hui saturés — les meilleurs modèles s'y tassent dans la marge de bruit statistique, incapables d'être départagés [[6](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fwww.stacksweep.dev%2Fai-benchmark-saturation-study%3Futm_source=tldrdev/1/0100019fd1a45d53-e17d9fff-1c81-41cc-b713-a381aabd6776-000000/-8q2V520XjmBGctFibwEZQKRcNuscLv4TornSJK7OQ0=452). Pire : les garde-fous qu'on croyait efficaces — jeux de test privés, formats de sortie plus durs — ne changent rien une fois qu'on tient compte de l'âge du benchmark. Ce qui protège le moins bien un classement de la saturation, c'est justement ce qu'on utilise le plus pour vendre un nouveau modèle comme meilleur que le précédent.

Alors, CLI partout, contexte qui gonfle, PR géantes à saucissonner et classements qui ne veulent plus dire grand-chose : est-ce qu'on est vraiment en train de progresser, ou juste d'empiler des couches sur un socle qu'on n'a plus les moyens d'évaluer correctement ?

---

## Sources

1. [Introducing the Warp Agent CLI: a CLI coding agent that does what others can't](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fwww.warp.dev%2Fblog%2Fintroducing-the-warp-agent-cli-coding-agent%3Futm_source=tldrdev/1/0100019fd1a45d53-e17d9fff-1c81-41cc-b713-a381aabd6776-000000/zmQlkjt4WTwHVafEoBNalkAsRMSj5znizL-jMKbans0=452)
2. [Deep Dive: Why did DoorDash ship a CLI?](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fwww.productcurious.com%2Fp%2Fdeep-dive-why-did-doordash-ship-a%3Futm_source=tldrdev/1/0100019fd1a45d53-e17d9fff-1c81-41cc-b713-a381aabd6776-000000/IQ99TvvFD3tvykh7AYhL9-Kc3-AzJYfeqtNoR50yiOk=452)
3. [Introducing Kiro Crew](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fkiro.dev%2Fblog%2Fintroducing-kiro-crew%2F%3Futm_source=tldrai/1/0100019fd218b862-89c5c98e-d9a5-4962-84ad-5b81373ac057-000000/70dMTPh1uUI314Svwq6NytVtJUJRyXeKZMLqKFXLOyo=452)
4. [What Codex Actually Sends to the Model](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Flinks.tldrnewsletter.com%2FHg16HJ/1/0100019fd218b862-89c5c98e-d9a5-4962-84ad-5b81373ac057-000000/9VmIYyUSUDj9AyibvxNJ9_qMsOOVo4FI1FJO3R8wvWQ=452)
5. [Turn one giant AI-generated pull request to a reviewable stack](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fgithub.blog%2Fengineering%2Fturn-one-giant-ai-generated-pull-request-to-a-reviewable-stack%2F%3Futm_source=tldrdev/1/0100019fd1a45d53-e17d9fff-1c81-41cc-b713-a381aabd6776-000000/y20TY2Mrn0sFsGYDDSywTVKcs6EdcrcK09nNDWEHdcc=452)
6. [What Actually Keeps an AI Benchmark Useful? Scale](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fwww.stacksweep.dev%2Fai-benchmark-saturation-study%3Futm_source=tldrdev/1/0100019fd1a45d53-e17d9fff-1c81-41cc-b713-a381aabd6776-000000/-8q2V520XjmBGctFibwEZQKRcNuscLv4TornSJK7OQ0=452)

## Pour aller plus loin

- [Unpacking ChatGPT Work: the Agent for a Billion Users](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fwww.latent.space%2Fp%2Funpacking-chatgpt-work%3Futm_source=tldrai/1/0100019fd218b862-89c5c98e-d9a5-4962-84ad-5b81373ac057-000000/wo7lf0fvq3_wUCF035NkDaltG38DlhU_0GDrQYapcak=452) — pour comprendre comment OpenAI pense l'agentification à très grande échelle.
- [Mixture-of-Kittens: our open-source MoE megakernel for NVL72s](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fcursor.com%2Fblog%2Fmixture-of-kittens%3Futm_source=tldrai/1/0100019fd218b862-89c5c98e-d9a5-4962-84ad-5b81373ac057-000000/VZJSwZ6j90XGn3_8_VOLoyUhZvw1FcyybAJIDVaC-M0=452) — la brique d'infra qui permet justement de faire tourner ces agents moins cher.
- ["Keep going, bro. You've got this!" — a data-driven look at how adversaries are weaponizing AI](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fblog.talosintelligence.com%2Fkeep-going-bro-youve-got-this-a-data-driven-look-at-how-adversaries-are-weaponizing-ai%2F%3Futm_source=tldrdev/1/0100019fd1a45d53-e17d9fff-1c81-41cc-b713-a381aabd6776-000000/KmPB3SjAlPBzb7J-t5ik_d-GrsGR0hvNaK1nmuxoRnw=452) — le revers de la médaille, côté attaquants.
- [Anthropic signs $10B deal with AI cloud startup Volta](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Ftechcrunch.com%2F2026%2F08%2F04%2Fanthropic-signs-10-billion-deal-with-ai-cloud-startup-volta%2F%3Futm_source=tldrai/1/0100019fd218b862-89c5c98e-d9a5-4962-84ad-5b81373ac057-000000/tr1MNnatBPYIwcSXR833kA7m0FgeqUtZ2n-wFJu2mBw=452) — pour mesurer l'ampleur des paris d'infra qui rendent tout ça possible.

*Cet article a été rédigé en m'appuyant sur une IA pour m'aider à synthétiser et structurer ma veille. Les idées, le choix des sources et la relecture restent les miens.*

