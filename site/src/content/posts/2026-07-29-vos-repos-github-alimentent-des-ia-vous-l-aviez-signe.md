---
title: "Vos repos GitHub alimentent des IA — vous l'aviez signé ?"
date: "2026-07-29"
description: "Depuis avril 2026, les nouvelles CGU de GitHub autorisent l'utilisation de votre code public pour entraîner des modèles IA, y compris ceux de Microsoft. Ce qui change vraiment, et comment reprendre le contrôle."
tags: ["ai", "github", "données", "open-source"]
image: "2026-07-29.webp"
kind: "veille"
---

# Vos repos GitHub alimentent des IA — vous l'aviez signé ?

Depuis le 27 avril 2026, les nouvelles CGU de GitHub sont en vigueur. Chaque ligne de code poussée sur un repo public peut servir à entraîner des modèles d'IA commerciaux. Pas demain — aujourd'hui. Est-ce que vous avez vraiment conscience de ce à quoi vous avez consenti en cliquant « J'accepte » ?

### Ce que la section D.4 dit vraiment

Les Conditions Générales d'Utilisation de GitHub [[1](https://docs.github.com/articles/github-terms-of-service)] l'énoncent sans ambiguïté : en publiant du contenu sur la plateforme, vous accordez à GitHub et à ses affiliés le droit de le stocker, l'analyser, le copier — et de l'utiliser pour développer et améliorer des modèles d'intelligence artificielle. Ce qui inclut, noir sur blanc, les modèles de Microsoft, citée explicitement comme affiliée de GitHub.

Je le lis avec un regard particulier. Mes propres projets publics — des Cloud Functions, des scripts d'infra, des expérimentations GenAI — tombent dans cette catégorie. Votre proof-of-concept du week-end aussi. Le texte précise que l'usage de votre contenu pour entraîner ces modèles ne constitue pas une « vente » ou un transfert restreint de votre propriété intellectuelle. C'est légalement correct. Mais ça ne rend pas la chose moins significative.

### La clause D.9 : quand les scrapers se retrouvent pris à leur propre jeu

La section D.9 des mêmes CGU [[1](https://docs.github.com/articles/github-terms-of-service)] introduit une logique de réciprocité que j'ai trouvée franchement audacieuse. Si vous ou votre organisation utilisez des outils automatisés pour extraire du contenu public de GitHub en vue de développer un « système IA commercial », vous renoncez automatiquement à toute restriction de vos propres services qui bloquerait GitHub d'accéder à vos données publiques en retour.

Traduction directe : si vous scrappez GitHub pour nourrir votre IA, GitHub peut scrapper vos produits publics pour alimenter les siens. Une clause miroir, légalement bien construite.

Une exception notable : la recherche académique et les services comptant moins de 700 millions d'utilisateurs actifs mensuels restent hors champ. Pour les grands acteurs du cloud ou les éditeurs de solutions IA — c'est un accord implicite qu'ils acceptent dès lors qu'ils continuent à opérer sur GitHub.

### Vos données, la confidentialité, et vos droits réels

La Déclaration de confidentialité de GitHub [[2](https://docs.github.com/articles/github-privacy-policy)] précise comment ces données transitent. Vos informations personnelles peuvent être partagées avec Microsoft et d'autres affiliés dans le but de « développer, entraîner et améliorer des technologies d'IA ». Les transferts vers les États-Unis sont couverts par les clauses contractuelles types de la Commission européenne — conformité RGPD assurée sur le papier, mais la réalité reste que votre code atterrit outre-Atlantique.

Ce qui compte concrètement : en tant qu'utilisateur européen, vous disposez de droits réels. Accès à vos données, rectification, suppression, portabilité. Et surtout, un droit d'opt-out explicite sur l'utilisation de vos inputs et outputs avec les fonctionnalités IA pour l'entraînement des modèles.

### Où aller pour reprendre la main

L'opt-out existe. La section J.3 des CGU le confirme — mais le texte ne vous guide pas spontanément vers l'action. En pratique, c'est dans les paramètres de votre compte que ça se passe.

Quelques repères utiles : la gestion de vos préférences d'emails et de notifications [[3](https://github.com/settings/emails)] permet de contrôler les communications liées à votre activité sur la plateforme. Les alertes de vulnérabilité sur vos repos sont configurables depuis votre tableau de bord de sécurité [[4](https://github.com/settings/notifications#vulnerability-alerts-heading)]. Et pour accéder à l'ensemble de ces paramètres, tout commence par votre compte utilisateur [[5](https://github.com/login)].

C'est là, dans ces pages de configuration, que se joue en pratique ce que vous acceptez ou refusez — pas dans les 50 pages de legalese que personne ne lit jusqu'au bout.

### Code ouvert, mais à quel prix ?

L'open source a toujours reposé sur un contrat moral implicite : je partage mon code, la communauté en bénéficie, on progresse ensemble. Ce que ces CGU formalisent, c'est quelque chose de plus ambigu — votre contribution alimentant des modèles propriétaires commerciaux, sans rémunération, souvent sans que vous l'ayez activement décidé.

Est-ce un problème en soi ? Pas forcément. Mais c'est un choix — et ce choix méritait d'être visible.

La vraie question que je me pose : est-ce que les mainteneurs de projets open source qui hébergent leur travail sur GitHub [[6](https://github.com/allienna)] ont vraiment intégré cette dimension dans leur façon de licencier leur code ? Les licences open source classiques ont été pensées avant que l'entraînement IA devienne un enjeu économique massif. Il y a peut-être une réflexion à mener là.

---

## Sources

1. [GitHub Terms of Service - GitHub Docs](https://docs.github.com/articles/github-terms-of-service)
2. [GitHub General Privacy Statement - GitHub Docs](https://docs.github.com/articles/github-privacy-policy)
3. [Build software better, together](https://github.com/settings/emails)
4. [Build software better, together](https://github.com/settings/notifications#vulnerability-alerts-heading)
5. [Build software better, together](https://github.com/login)
6. [allienna - Overview](https://github.com/allienna)

## Pour aller plus loin

- [GitHub - allienna/cloudfunction-hello-world: Simple cloudfunction hello-world](https://github.com/allienna/cloudfunction-hello-world) — Un exemple concret de repo public typique : exactement le type de code concerné par les nouvelles dispositions des CGU sur l'entraînement IA
- [GitHub Terms of Service - GitHub Docs](https://docs.github.com/articles/github-terms-of-service) — La section J en entier sur les fonctionnalités IA et le droit d'opt-out, indispensable si vous gérez des repos d'équipe ou d'organisation
- [GitHub General Privacy Statement - GitHub Docs](https://docs.github.com/articles/github-privacy-policy) — Le détail des droits RGPD et la procédure pour exercer vos droits de suppression ou de portabilité de données

*Cet article a été rédigé en m'appuyant sur une IA pour m'aider à synthétiser et structurer ma veille. Les idées, le choix des sources et la relecture restent les miens.*
