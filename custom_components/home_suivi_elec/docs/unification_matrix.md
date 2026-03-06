# Matrice d'unification HSE

> Synthèse opérationnelle dérivée de `architecture_current_state.md` pour préparer la suite de la refonte sans repartir d’une feuille blanche.

## Lecture rapide

L’intégration n’est plus dans un état “tout est spécifique par onglet”. Le socle commun existe déjà, mais son niveau de maturité varie selon les domaines.

## État des blocs

| Bloc | Niveau actuel | Ce qui est déjà en place | Ce qui manque encore |
|---|---|---|---|
| Bootstrap / runtime | Bien mutualisé | API unifiée, panel unique, stores chargés au setup, tâches périodiques | Peu de choses structurelles ; surtout clarifier la doc |
| Catalogue | Bien mutualisé | Scan, identité stable des items, santé, escalade, triage persistant | Vérifier que toutes les vues consomment ce modèle plutôt que des reconstructions locales |
| Meta | Bien mutualisé | Snapshot HA, pending diff, application auto/all, respect des modes manuels | Mieux relier cette couche à l’UI et aux autres vues métier |
| Pricing | Bien mutualisé | Stockage central dans `catalogue.settings.pricing`, validation, defaults | Réutilisation plus systématique par les vues aval |
| API unifiée | Bien mutualisé | Registre central des vues par familles métier | Normaliser les contrats entre familles et compléter la doc vue par vue |
| Enrichissement | Partiellement mutualisé | Convention stable `base -> kwh_total/day/week/month/year`, preview/apply/diagnose/cleanup | Mieux raccorder cette convention aux calculs dashboard et aux besoins UI |
| Migration / export | Partiellement mutualisé | Exports YAML cohérents avec la convention HSE, réutilisation de la sélection pricing | Partie coût encore limitée, contrat fixe seulement, auto-create non implémenté |
| Overview / dashboard | Contrat avancé mais incomplet | Endpoint unique, structure riche, logique live fonctionnelle, delta référence | Calculs de coûts et tableaux encore vides ; moteur métier manquant |
| Frontend panel | Partiellement mutualisé | Panel unique, familles de features, consommation d’une API unifiée | Certains écrans attendent des données plus avancées que celles réellement fournies |

## Ce qui est déjà solide

- L’intégration possède un **noyau commun** crédible.
- Le stockage persistant métier existe déjà.
- La convention d’enrichissement des entités est déjà identifiable.
- Le pricing n’est plus diffus : il est centralisé.
- L’overview possède déjà un contrat d’affichage assez mature.

## Ce qui reste incomplet

- Le calcul métier n’est pas encore entièrement mutualisé dans les vues qui l’exigent.
- Le dashboard overview est le cas le plus visible : structure prête, moteur incomplet.
- La partie coût est encore dispersée entre intention UI, exports YAML et données manquantes côté backend.
- Certaines conventions sont présentes dans le code, mais pas encore assez explicites dans la documentation de maintenance.

## Route recommandée

1. Finir la cartographie documentaire des vues restantes.
2. Consolider une source unique de calcul coût/énergie utilisable par l’overview et, si possible, par l’export.
3. Éviter d’ajouter de nouvelles logiques spécifiques par onglet.
4. Corriger l’overview seulement après avoir identifié la bonne couche commune pour les calculs.
5. Faire ensuite une passe de documentation de maintenance plus fine fichier par fichier.

## Décision proposée pour la suite

La meilleure suite n’est pas une correction directe du dashboard en isolation. La meilleure suite est de faire émerger une **couche métier commune** “énergie -> coût” que l’overview pourra consommer sans réinventer ses propres règles.
