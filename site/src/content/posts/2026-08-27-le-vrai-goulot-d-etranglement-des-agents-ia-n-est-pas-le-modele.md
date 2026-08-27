---
title: "Le vrai goulot d'étranglement des agents IA n'est pas le modèle"
date: "2026-08-27"
description: "Identité, mémoire et évaluation : ce qui bloque vraiment les agents IA en production, au-delà du choix du modèle."
tags: ["ai", "agents", "identity", "llmops"]
image: "2026-08-27.webp"
kind: "veille"
---

# Le vrai goulot d'étranglement des agents IA n'est pas le modèle

On continue de comparer les modèles sur leur capacité à raisonner, leur prix au token, leur classement dans tel benchmark. Pourtant, un chiffre passé presque inaperçu chez Vercel dit autre chose : la part des modèles open-weight dans le trafic de leur passerelle IA est passée de 11 % à 62 % entre avril et fin août. Le goulot d'étranglement n'est plus l'intelligence du modèle. C'est tout ce qu'il y a autour : qui est cet agent, ce qu'il sait vraiment, et si on peut lui faire confiance avant de le lâcher en production.

### Un agent, ça s'identifie comme un salarié

Pendant des années, donner l'accès à un agent voulait dire créer un jeton qui ne périmait jamais, et croiser les doigts pour qu'il ne fuite pas. Le ranger dans un coffre-fort rendait le vol plus difficile, pas moins dangereux une fois le jeton dérobé. Vercel vient de sortir sa solution à ce problème : plutôt que de stocker un secret, l'application en redemande un à chaque exécution, limité à la tâche du moment et expirant tout seul. Après une bêta publique qui a fait grossir l'écosystème à plus de cent connecteurs, Vercel Connect passe en disponibilité générale [[1](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fvercel.com%2Fblog%2Fthe-end-of-credential-sprawl-for-agents%3Futm_source=tldrai/1/010001a03e62963b-b9c01e8c-bf34-42bc-8c0b-7e8adabfef9b-000000/k7Xv3NCVRPEYiUkofukyC9f5o90yjsre_ovvaTIwwjc=452)].

Au même moment, les fournisseurs d'identité s'attaquent à un problème voisin : combien d'agents tournent dans votre organisation sans que personne ne les ait vraiment enregistrés ? JumpCloud vend une gestion du cycle de vie identitaire pensée pour cette « main-d'œuvre agentique » : repérer l'IA fantôme, rattacher chaque agent à un humain responsable, et étendre les habilitations classiques aux comptes non humains [[2](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fjumpcloud.com%2Fplatform%2Fagentic-identity-lifecycle-management%3Futm_source=TLDR%26utm_medium=Contributed-Content%26utm_campaign=FY26Q1_MorningBrew_AD%26utm_content=TLDR8%2F26/1/010001a03e19d07e-4a5b8634-eb16-4c66-921f-6af1e5b6483d-000000/5rlp98IJasVbZwcITxw6H5BFMTb8lRNGuh3eJH9RMM8=452)]. Autrement dit : avant de demander à un agent d'agir, il faut déjà savoir qui il est.

### Ce qu'un agent sait n'est pas ce qu'il peut faire

Le mot « ontologie » est devenu fourre-tout : catalogue de données, couche de métriques, graphe de connaissances, modèle métier... Un article récent remet de l'ordre en distinguant deux niveaux qu'on confond trop souvent. L'ontologie décrit le sens : ce qu'est un client actif, quelles relations sont possibles, quelles règles s'appliquent. Le graphe de connaissances, lui, contient les faits bruts : telle commande, tel produit, tel historique. Un agent chargé d'approuver une remise a besoin des deux à la fois — la grammaire d'un côté, la preuve de l'autre — sans quoi il improvise [[3](https://substack.com/redirect/b0fc9d87-b1d8-4781-a356-2d022babc1b2?j=eyJ1IjoiN3Y1bG1jIn0.HlvPOGYPdVknSYzEK1JIj6IFkAFn8zuyjtfU9Mbft9Q)].

Une autre chronique illustre très concrètement pourquoi lire les données ne suffit pas. Après une fusion, une entreprise se retrouve avec deux systèmes de commandes : l'un code le statut « expédié » par un chiffre, l'autre par un mot. Réconcilier les deux dans une vue unique règle la question de la lecture. Mais le jour où quelqu'un veut annuler une commande depuis le tableau de bord, aucun bouton ne le permet : il faut rouvrir le vieux système. Toute la différence tient là, entre un modèle qui décrit le métier et un modèle capable d'agir dessus, avec des règles qui refusent par exemple d'annuler une commande déjà expédiée [[4](https://substack.com/redirect/2/eyJlIjoiaHR0cHM6Ly93d3cuZGF0YWVuZ2luZWVyaW5nd2Vla2x5LmNvbS9wL2J1aWxkaW5nLWFuLW9wZXJhdGlvbmFsLW9udG9sb2d5P3V0bV9jYW1wYWlnbj1lbWFpbC1oYWxmLXBvc3Qmcj03djVsbWMmdG9rZW49ZXlKMWMyVnlYMmxrSWpvME56VTFPVEkyTWpnc0luQnZjM1JmYVdRaU9qSXhNamMzTXpZeU1Dd2lhV0YwSWpveE56ZzNOelUwTmpFM0xDSmxlSEFpT2pFM09UQXpORFkyTVRjc0ltbHpjeUk2SW5CMVlpMDNNekkzTVNJc0luTjFZaUk2SW5CdmMzUXRjbVZoWTNScGIyNGlmUS54NnM2RkZGeDlsMk9yai02SEF2b3NjYXBqZW5DWng4NGdQam1RS2hqbUFZIiwicCI6MjEyNzczNjIwLCJzIjo3MzI3MSwiZiI6dHJ1ZSwidSI6NDc1NTkyNjI4LCJpYXQiOjE3ODc3NTQ2MTcsImV4cCI6MjEwMzMzMDYxNywiaXNzIjoicHViLTAiLCJzdWIiOiJsaW5rLXJlZGlyZWN0In0.UNsdz1eypPMNAR_GxeuKSk0rzf3s6w0OgDt6AkmbhPo?)].

> « Peut-on annuler une commande depuis votre couche sémantique ? »

C'est cette question qui sépare un joli graphe de connaissances d'un système que l'on peut réellement confier à un agent.

Anthropic avance sur un terrain voisin : ce que l'agent retient d'une conversation à l'autre. Depuis cette semaine, tout ce que l'on raconte à Claude en discussion nourrit aussi Claude Cowork, et inversement — plus besoin de dire « retiens ça », plus besoin d'attendre la fin de l'échange pour que l'information soit captée. Mentionnez qu'une échéance a glissé à septembre, et la conversation suivante le sait déjà [[5](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fthenextweb.com%2Fnews%2Fanthropic-claude-cowork-shared-memory-default%3Futm_source=tldrai/1/010001a03e62963b-b9c01e8c-bf34-42bc-8c0b-7e8adabfef9b-000000/r0AftpiFrC1rGDxAgf7TBK-2aPcx_ObfQvTagVyqTGs=452)].

### Reste à vérifier que tout ça fonctionne vraiment

Une identité, une mémoire, un modèle du métier : il manque encore la case évaluation. Une équipe de Microsoft raconte comment un système censé réduire les fausses alertes de détection de secrets sur GitHub, pourtant convaincant sur un jeu de test propre, s'est heurté à une réalité plus confuse : entrées ambiguës, contexte tronqué, cas limites absents des bancs d'essai habituels. Leur premier réflexe n'a pas été de changer de modèle, mais de reformuler la vraie décision business à trancher : peut-on réduire le bruit sans perdre trop de rappel, pour rester sûr dans un flux de sécurité [[6](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fgithub.blog%2Fai-and-ml%2Fllms%2Fhow-to-evaluate-llms-before-production%3Futm_source=tldrdev/1/010001a03dc5205c-71f4ec27-739a-4983-9c01-017db1848042-000000/NWh_4TzNXDrahh1kMZfSj7YVYJOPf9a-7bwTESyNbvc=452)] ?

Cette rigueur devient d'autant plus nécessaire que le choix du modèle se complique. Toujours chez Vercel, les modèles open-weight captaient 29 % du volume de tokens en juin pour moins de 4 % de la dépense, contre 32 % du volume et 61 % de la dépense pour Anthropic sur la même période. L'écart entre volume et facture s'élargit : router chaque tâche vers le bon modèle — le frontière cher pour le raisonnement difficile, l'open-weight bon marché pour la classification ou les étapes répétitives — suppose de savoir mesurer, tâche par tâche, ce qui marche vraiment [[7](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fwww.constellationr.com%2Fresearch%2Fblog%2Fopen-weight-models-are-gaining-ground-enterprise-ai%3Futm_source=tldrit/1/010001a03e19d07e-4a5b8634-eb16-4c66-921f-6af1e5b6483d-000000/GXvfxv5o6v8vrifz5Cnv9NDUDA5ml2VT2m5FaiW5zUY=452)].

On a mis des décennies à construire des systèmes RH capables de dire qui a le droit de faire quoi, et à quel poste. Pour nos agents, on n'a même pas fini d'écrire la fiche de poste. Combien de temps avant qu'on la termine ?

---

## Sources

1. [The end of credential sprawl for agents](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fvercel.com%2Fblog%2Fthe-end-of-credential-sprawl-for-agents%3Futm_source=tldrai/1/010001a03e62963b-b9c01e8c-bf34-42bc-8c0b-7e8adabfef9b-000000/k7Xv3NCVRPEYiUkofukyC9f5o90yjsre_ovvaTIwwjc=452)
2. [Agentic Identity Lifecycle Management](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fjumpcloud.com%2Fplatform%2Fagentic-identity-lifecycle-management%3Futm_source=TLDR%26utm_medium=Contributed-Content%26utm_campaign=FY26Q1_MorningBrew_AD%26utm_content=TLDR8%2F26/1/010001a03e19d07e-4a5b8634-eb16-4c66-921f-6af1e5b6483d-000000/5rlp98IJasVbZwcITxw6H5BFMTb8lRNGuh3eJH9RMM8=452)
3. [What an Ontology for AI Agents Actually Needs](https://substack.com/redirect/b0fc9d87-b1d8-4781-a356-2d022babc1b2?j=eyJ1IjoiN3Y1bG1jIn0.HlvPOGYPdVknSYzEK1JIj6IFkAFn8zuyjtfU9Mbft9Q)
4. [Building an Operational Ontology: An E-Commerce Walkthrough](https://substack.com/redirect/2/eyJlIjoiaHR0cHM6Ly93d3cuZGF0YWVuZ2luZWVyaW5nd2Vla2x5LmNvbS9wL2J1aWxkaW5nLWFuLW9wZXJhdGlvbmFsLW9udG9sb2d5P3V0bV9jYW1wYWlnbj1lbWFpbC1oYWxmLXBvc3Qmcj03djVsbWMmdG9rZW49ZXlKMWMyVnlYMmxrSWpvME56VTFPVEkyTWpnc0luQnZjM1JmYVdRaU9qSXhNamMzTXpZeU1Dd2lhV0YwSWpveE56ZzNOelUwTmpFM0xDSmxlSEFpT2pFM09UQXpORFkyTVRjc0ltbHpjeUk2SW5CMVlpMDNNekkzTVNJc0luTjFZaUk2SW5CdmMzUXRjbVZoWTNScGIyNGlmUS54NnM2RkZGeDlsMk9yai02SEF2b3NjYXBqZW5DWng4NGdQam1RS2hqbUFZIiwicCI6MjEyNzczNjIwLCJzIjo3MzI3MSwiZiI6dHJ1ZSwidSI6NDc1NTkyNjI4LCJpYXQiOjE3ODc3NTQ2MTcsImV4cCI6MjEwMzMzMDYxNywiaXNzIjoicHViLTAiLCJzdWIiOiJsaW5rLXJlZGlyZWN0In0.UNsdz1eypPMNAR_GxeuKSk0rzf3s6w0OgDt6AkmbhPo?)
5. [Claude finally connects the dots between its own apps](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fthenextweb.com%2Fnews%2Fanthropic-claude-cowork-shared-memory-default%3Futm_source=tldrai/1/010001a03e62963b-b9c01e8c-bf34-42bc-8c0b-7e8adabfef9b-000000/r0AftpiFrC1rGDxAgf7TBK-2aPcx_ObfQvTagVyqTGs=452)
6. [How to evaluate LLMs before production](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fgithub.blog%2Fai-and-ml%2Fllms%2Fhow-to-evaluate-llms-before-production%3Futm_source=tldrdev/1/010001a03dc5205c-71f4ec27-739a-4983-9c01-017db1848042-000000/NWh_4TzNXDrahh1kMZfSj7YVYJOPf9a-7bwTESyNbvc=452)
7. [Open-Weight Models Are Gaining Ground in Enterprise AI](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fwww.constellationr.com%2Fresearch%2Fblog%2Fopen-weight-models-are-gaining-ground-enterprise-ai%3Futm_source=tldrit/1/010001a03e19d07e-4a5b8634-eb16-4c66-921f-6af1e5b6483d-000000/GXvfxv5o6v8vrifz5Cnv9NDUDA5ml2VT2m5FaiW5zUY=452)

## Pour aller plus loin

- [GitHub - gura105/operational-ontology](https://substack.com/redirect/4a7175cc-c11d-4388-94da-0d9d3bb75148?j=eyJ1IjoiN3Y1bG1jIn0.HlvPOGYPdVknSYzEK1JIj6IFkAFn8zuyjtfU9Mbft9Q) — l'implémentation de référence minimaliste qui accompagne le pattern décrit plus haut, pour voir le code plutôt que la théorie.
- [Quantization from the ground up | ngrok blog](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fngrok.com%2Fblog%2Fquantization%3Futm_source=tldrai/1/010001a03e62963b-b9c01e8c-bf34-42bc-8c0b-7e8adabfef9b-000000/ndSMlgO4uzOADz6qj9nRjh8_j4L47Nwr4Mfx4a7skuU=452) — pour comprendre, technique à l'appui, comment on fait tenir un modèle en moins de bits sans tout casser.
- [Apple's new desktop computers are designed specifically for local AI development](https://tracking.tldrnewsletter.com/CL0/https:%2F%2Farstechnica.com%2Fapple%2F2026%2F08%2Fwith-new-mac-studio-and-mac-mini-apple-leans-hard-into-local-ai-inference%2F%3Futm_source=tldrit/1/010001a03e19d07e-4a5b8634-eb16-4c66-921f-6af1e5b6483d-000000/0T4nY310SWAqh5iMOqPqPmEnzJNOyS18Tu4yJ3BriK0=452) — quand l'inférence locale devient un argument de vente pour du matériel grand public.

*Cet article a été rédigé en m'appuyant sur une IA pour m'aider à synthétiser et structurer ma veille. Les idées, le choix des sources et la relecture restent les miens.*
