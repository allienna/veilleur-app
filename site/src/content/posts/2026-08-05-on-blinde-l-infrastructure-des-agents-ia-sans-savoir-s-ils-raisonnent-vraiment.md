---
title: "On blinde l'infrastructure des agents IA, sans savoir s'ils raisonnent vraiment"
date: "2026-08-05"
description: "Le cloud investit massivement dans l'hébergement d'agents IA autonomes (coûts, données, identité), pendant que la recherche doute encore de la fiabilité de leur raisonnement affiché."
tags: ["ai", "cloud", "agents"]
image: "2026-08-05.webp"
kind: "veille"
---

# On blinde l'infrastructure des agents IA, sans savoir s'ils raisonnent vraiment

274 agents IA sur un seul nœud de calcul, contre 61 il y a encore quelques mois. Le tout avec une facture réduite de 75 %. Pendant que le cloud s'organise à toute vitesse pour héberger des armées d'agents autonomes, un journaliste de Quanta Magazine avoue publiquement ne plus savoir si ces mêmes agents « réfléchissent » ou s'ils bluffent avec un aplomb remarquable. Les deux sujets se percutent, et c'est ça qui m'intéresse aujourd'hui.

### Le cloud se réorganise autour des agents qui agissent

Google Cloud publie son point mensuel sur l'infrastructure IA [[1](https://cloud.google.com/blog/topics/ai-infrastructure/whats-new-in-ai-infrastructure-this-month/)], et le message est clair : on ne parle plus seulement de modèles, mais de tuyauterie complète pour l'« ère agentique » — stockage GA à plusieurs pétaoctets, VM taillées pour éliminer les goulots d'étranglement réseau, clusters GKE capables de tenir 15 000 nœuds avec leurs règles réseau actives.

Le cas le plus parlant reste GKE Agent Sandbox [[2](https://cloud.google.com/blog/products/containers-kubernetes/reduce-your-agents-costs-with-gke-agent-sandbox/)]. En isolant chaque agent dans un environnement gVisor plutôt que dans une micro-VM classique, l'équipe est passée de 61 agents par nœud à 88, puis jusqu'à 274 en combinant cette isolation légère avec des mécanismes de mise en veille des agents inactifs. Résultat annoncé : jusqu'à 75 % d'économie par agent. Concrètement, un agent qui attend une réponse humaine n'a plus besoin de consommer du CPU pour rien pendant ce temps mort.

### Donner à l'agent l'accès aux données... et à une identité fiable

Cette poussée d'infrastructure s'accompagne d'un changement d'accès aux données. Le « borderless Lakehouse » [[3](https://cloud.google.com/blog/products/data-analytics/introducing-the-borderless-lakehouse/)] veut permettre à des agents conversationnels d'interroger des données réparties entre plusieurs clouds et catalogues (AWS Glue, Databricks, Snowflake) sans jamais les dupliquer, via le protocole Iceberg REST. Et les capacités d'analyse conversationnelle sur BigQuery, Looker, AlloyDB, Spanner et Cloud SQL passent en disponibilité générale [[4](https://cloud.google.com/blog/products/data-analytics/conversational-analytics-in-google-data-cloud-in-q326/)] : on peut désormais interroger une base de production en langage naturel, avec chiffrement et résidence des données garantis.

Reste un problème plus terre à terre : qui a le droit d'accéder à quoi ? Best Buy raconte comment l'enseigne a remplacé ses comptes de service, gérés à la main et sources de fuites, par une fédération d'identité directement reliée à Entra ID [[5](https://cloud.google.com/blog/topics/retail/best-buy-scales-secure-ai-access-with-workforce-identity-federation/)]. Plus de clés à faire tourner, une traçabilité complète de qui a déclenché quelle action IA. Un détail d'infrastructure, mais qui conditionne toute la confiance qu'on peut accorder à un agent qui touche à des données sensibles.

### Sauf qu'on ne sait toujours pas si l'agent réfléchit

Voilà pour la mécanique. Sur le fond, c'est plus trouble. Un long article de Quanta Magazine revient sur deux ans de rebondissements autour des modèles de raisonnement (LRM) [[1](https://elink56e.dataelixir.com/ss/c/u001.IgA5xx2nQ-1ekHkKegwAebGPMU1Qi5kq_SGptAV6bnkwkaP0gC-JUPRh3ebJxnxzVzQrosxQTSn6uwIj7A2epAl4pN1MmHqhNeg0HvYMSVYNvv3PRMYqYQMSYupP6Vhc-RtZyXO4XpLnQ5h41DhTWjz0dT9b1cwcBMsEFD7GAgDNgq6wuqIQEoKOz3pESXfqVqmfBplESEBh232nmM4rzeFvjzeIHrpBaXErbCxPaWOHBP47f9u77sRLhXfbYbIx/4sw/PUM79-FfSzSxt3L0foGkpA/h3/h001.R8e_-EwLL_e1D3AHLzFk-UIvIuJFPtH3Rlpv4Z9eA9U)] : accusés d'« illusion de pensée » par des chercheurs d'Apple, puis médaillés d'or à l'Olympiade internationale de mathématiques quelques mois plus tard, puis à nouveau soupçonnés de simplement exploiter des raccourcis superficiels sur certains bancs d'essai.

Le point le plus troublant concerne les chaînes de raisonnement que ces modèles affichent avant de répondre. Plusieurs études montrent que ce texte intermédiaire ne reflète pas fidèlement ce qui se passe réellement dans le modèle : on peut le remplacer par du texte incohérent, voire par de simples suites de points, sans que la justesse de la réponse finale change beaucoup. Une partie de ces « pensées » affichées n'aurait donc qu'un rôle causal minime.

> « Rien ne garantit que la chaîne de raisonnement doive avoir un sens quelconque. »

C'est ce que rappelle William Merrill, chercheur au Toyota Technological Institute, cité dans l'article. Une phrase qui devrait faire réfléchir toute équipe en train de brancher un agent sur des données de production en s'appuyant sur son raisonnement affiché comme preuve de fiabilité.

Cette incertitude nourrit aussi un autre besoin très concret : celui de mesurer, plutôt que de croire. Le projet smevals [[2](https://elink56e.dataelixir.com/ss/c/u001.VpF4xgnYECCESbS0JhdGGe17M7wxg0K_AHQbc4ELauCvsutejp4294TEm-AyJSm0cH52I341fwa9Ra0juXmTre8qclW4oYW_g7Gil-LIPibzt-pfAF0GfRbiNZGqF_130dxjOq7AwxhKNW1skS_aE6CWczixav8YMj6NXzCOhpzCv9xt3mGmzWhttzz1z3NPNT-yMcaDw4YDX3YQ8I5xUw/4sw/PUM79-FfSzSxt3L0foGkpA/h11/h001.vB-c7zczFWuOLHy8AmDVsrvH_LVIq_sid3VkehYVTJI)] part d'un constat simple — les modèles les plus puissants deviennent de plus en plus chers, alors que des alternatives légères progressent vite. D'où l'idée d'une suite de tests personnalisable pour repérer, tâche par tâche, quel modèle offre le meilleur rapport qualité-prix, plutôt que de se fier à la réputation d'un seul fournisseur. Dans le même esprit pragmatique, un guide très commenté sur le choix d'une IA à utiliser au quotidien [[3](https://elink56e.dataelixir.com/ss/c/u001.IgA5xx2nQ-1ekHkKegwAeZkZISDqrvoVlU5YUCLOG7tSw_XkKg4vhudq6tuEioCBaizBYDZWQesqecGg6_z8MzHqcKqKP5i-YuBm9nMxJXdNG52rSbwnsg8UR8zmQTIQd0cCEG4kQHnFBE6NLUJq-tHgx-r-18H_uiSDCWbhnKzQOGR6o-fXt-3nz0foNRKhQBoBfTSudaq_3i0DAl06AszyjPuE1WGvvQKjYA1Sbx2oIql38wRF8l_mN6VDPkdz/4sw/PUM79-FfSzSxt3L0foGkpA/h13/h001.GcFkUAuNlxXBaruwWnn5rq6Clle9rTxAMdCTX4Wqc-Y)] recommande de réserver les modèles les plus avancés (et les plus chers) aux décisions à fort enjeu, et de laisser les modèles « suffisants » gérer le reste.

Alors, doit-on ralentir la course à l'infrastructure agentique tant qu'on n'a pas tranché la question du raisonnement ? Ou continuer à optimiser la tuyauterie en attendant que la recherche fondamentale rattrape le terrain ?

---

## Sources

1. [Is AI Reasoning Right for the Wrong Reasons? | Quanta Magazine](https://elink56e.dataelixir.com/ss/c/u001.IgA5xx2nQ-1ekHkKegwAebGPMU1Qi5kq_SGptAV6bnkwkaP0gC-JUPRh3ebJxnxzVzQrosxQTSn6uwIj7A2epAl4pN1MmHqhNeg0HvYMSVYNvv3PRMYqYQMSYupP6Vhc-RtZyXO4XpLnQ5h41DhTWjz0dT9b1cwcBMsEFD7GAgDNgq6wuqIQEoKOz3pESXfqVqmfBplESEBh232nmM4rzeFvjzeIHrpBaXErbCxPaWOHBP47f9u77sRLhXfbYbIx/4sw/PUM79-FfSzSxt3L0foGkpA/h3/h001.R8e_-EwLL_e1D3AHLzFk-UIvIuJFPtH3Rlpv4Z9eA9U)
2. [smevals - a small eval suite for evaluating models, prompts, and harnesses](https://elink56e.dataelixir.com/ss/c/u001.VpF4xgnYECCESbS0JhdGGe17M7wxg0K_AHQbc4ELauCvsutejp4294TEm-AyJSm0cH52I341fwa9Ra0juXmTre8qclW4oYW_g7Gil-LIPibzt-pfAF0GfRbiNZGqF_130dxjOq7AwxhKNW1skS_aE6CWczixav8YMj6NXzCOhpzCv9xt3mGmzWhttzz1z3NPNT-yMcaDw4YDX3YQ8I5xUw/4sw/PUM79-FfSzSxt3L0foGkpA/h11/h001.vB-c7zczFWuOLHy8AmDVsrvH_LVIq_sid3VkehYVTJI)
3. [An opinionated guide to which AI to use to do stuff](https://elink56e.dataelixir.com/ss/c/u001.IgA5xx2nQ-1ekHkKegwAeZkZISDqrvoVlU5YUCLOG7tSw_XkKg4vhudq6tuEioCBaizBYDZWQesqecGg6_z8MzHqcKqKP5i-YuBm9nMxJXdNG52rSbwnsg8UR8zmQTIQd0cCEG4kQHnFBE6NLUJq-tHgx-r-18H_uiSDCWbhnKzQOGR6o-fXt-3nz0foNRKhQBoBfTSudaq_3i0DAl06AszyjPuE1WGvvQKjYA1Sbx2oIql38wRF8l_mN6VDPkdz/4sw/PUM79-FfSzSxt3L0foGkpA/h13/h001.GcFkUAuNlxXBaruwWnn5rq6Clle9rTxAMdCTX4Wqc-Y)
4. [What's new in AI infrastructure this month | Google Cloud Blog](https://cloud.google.com/blog/topics/ai-infrastructure/whats-new-in-ai-infrastructure-this-month/)
5. [Reduce your agent's costs by 75% with GKE Agent Sandbox | Google Cloud Blog](https://cloud.google.com/blog/products/containers-kubernetes/reduce-your-agents-costs-with-gke-agent-sandbox/)
6. [Introducing the borderless Lakehouse | Google Cloud Blog](https://cloud.google.com/blog/products/data-analytics/introducing-the-borderless-lakehouse/)
7. [Conversational Analytics in Google Data Cloud in Q326 | Google Cloud Blog](https://cloud.google.com/blog/products/data-analytics/conversational-analytics-in-google-data-cloud-in-q326/)
8. [Best Buy scales secure AI access with Workforce Identity Federation | Google Cloud Blog](https://cloud.google.com/blog/topics/retail/best-buy-scales-secure-ai-access-with-workforce-identity-federation/)

## Pour aller plus loin

- [The mean means nothing](https://elink56e.dataelixir.com/ss/c/u001.EzeTNxhSOcDqyHVHqW9Z90ZvDp66no4EsCQXx0NnkeCft6334ZXIR9lYxlANQZbvmrk5IwfUfX-30iumnv1cRHXM7ad6t59fyQvNTvg485Cn7ZB9ovEWHXHIcv2Xl-mNgYQHK4rHerCpi8WNgLIN7ap6J98_Bx0qBDWpTrNW-3tIaNso4O71-v9ty-C-Z1x-AMREFQ8YivXmKrWLcpMvw0k581yhyfScNSSiW1UTmFI/4sw/PUM79-FfSzSxt3L0foGkpA/h4/h001.EsRtCFiZclHNmi-sRfzApixVB3h5iYYwEXuLU_-P9dA) — un rappel salutaire sur les pièges des statistiques descriptives, utile quand on évalue la performance d'un agent sur un seul chiffre moyen.
- [The Unreasonable Difficulty of Time Series Forecasting](https://elink56e.dataelixir.com/ss/c/u001.YqYtS1D2MrjfOoJwQR6Qw8qY7U71T6VewJIYnP91Kqaq76Rmhwwo3TY6JmelSWidwyF9cPzwDOYHiAg7Abyv9uIikFdVdwMBr0EHPoApnhMT3z-OkHvN5Voy3VYR3W9PY78IVOvkes38EB0amatzynf5_436SPEx-DfIEgxgFmglQyEJjmIFDoavSSfk7IvoPslYOGjXPSZLrcVTAkt0puvmP3xxUOawhFk410QQ6Ae-UUsEuTrfsfyxywVBER3-CckWY2kC8KlYnNDtWtsZFA/4sw/PUM79-FfSzSxt3L0foGkpA/h14/h001.m1sc2GuOr275m5OBKsBBd0lUfq7l_JY35SpkqeLOp9s) — pourquoi prédire une série temporelle reste un problème piégeux, même pour des modèles puissants.
- [So how does lightning locating work?](https://elink56e.dataelixir.com/ss/c/u001.IgA5xx2nQ-1ekHkKegwAeSrm2YeY_20CCRSgtaWPcNYFlHME6CDUGUKcNG8OfQHEpNacPXEkJagDzHi4v00DC82H6uTuREED9Im7urNpAj4ulxHZkxYjt8PMnj0aqIsQdSbNtJnth9LMMuXV9rX1KaaFLbWg3FADmvxbRNxnGPBTu5Vus--aA_qzHoPj6qNAze16i_Yg7OvaNbHwwT2Vb0DPN9lQDWUqMWFAhwC-dT4/4sw/PUM79-FfSzSxt3L0foGkpA/h12/h001.iY-_cyVTBKr5yW1ZzHhkAyOZ_ljpLk4nwX-jqh7hwTA) — une plongée dans un système de mesure physique concret, pour changer d'air après tant d'abstraction algorithmique.
- [data.table, base, dplyr, pandas, and polars | Vincent Arel-Bundock](https://elink56e.dataelixir.com/ss/c/u001.7xEbcgVmsNrXDvo_DAiS7-6DG8ZfhA2P788LDA-U0AD9M-Fl4IB6wD5rzWBsIJO7MPAexhwj3llRpAbgfT2Mj0JBuGIEriSphy_wY-0Ss0DFjNanUUphk_OD0iyh_dmMlPaldoSoHeU95RiWmAv3ubs0CuocLd949nXt-SI1CecyDhKTXD_M-WlaAJbXK1YuDE_M0N5fUJ8h2hfK1PcsgA/4sw/PUM79-FfSzSxt3L0foGkpA/h15/h001.Og6znno4pf0iwWD1qAPJJ88IN2-Jy5_J20WxFAB0n2Q) — un comparatif approfondi des outils de manipulation de données, pour ceux qui doivent choisir leur stack avant même de parler d'IA.

*Cet article a été rédigé en m'appuyant sur une IA pour m'aider à synthétiser et structurer ma veille. Les idées, le choix des sources et la relecture restent les miens.*

