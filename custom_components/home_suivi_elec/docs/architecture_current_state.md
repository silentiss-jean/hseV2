# Architecture actuelle (audit initial)

> État observé avant correction fonctionnelle. Cette note sert de point d’entrée pour remettre la documentation à jour et préparer une unification progressive du backend.

## Noyau actuel

L’intégration est déjà structurée autour de quatre couches principales :

1. **Bootstrap / runtime** : `__init__.py`
2. **Stores partagés** : `catalogue_*`, `meta_*`
3. **API unifiée** : `api/unified_api.py` + `api/views/*`
4. **Panel frontend** : `web_static/panel/*`

## Ce qui semble déjà centralisé

- Enregistrement d’une **API unifiée** au démarrage.
- Exposition d’un **panel unique** (`hse-panel`).
- Chargement et persistance de deux états partagés :
  - `catalogue`
  - `meta`
- Deux boucles périodiques :
  - refresh du catalogue
  - meta sync

## Lecture actuelle du flux

### 1. Scan / catalogue

Le refresh catalogue scanne les `sensor.*`, détecte leur nature (`power` / `energy`), exclut les entités HSE générées, puis fusionne le résultat dans le catalogue persistant.

### 2. Meta

Une seconde boucle construit un snapshot HA, calcule un diff avec le store `meta`, puis conserve un état `pending_diff` pour l’UI et les opérations d’application.

### 3. UI

Le panel appelle principalement l’API unifiée, ce qui va dans le bon sens pour éviter un backend de calcul isolé par onglet.

## Point important déjà identifié

L’onglet **Accueil / overview** consomme bien `GET /api/home_suivi_elec/unified/dashboard`, mais `dashboard_overview.py` renvoie aujourd’hui une structure de coûts largement vide (`None`) alors que le frontend sait déjà afficher ces champs.

Cela suggère un état intermédiaire :

- la structure de centralisation existe,
- la chaîne scan / enrich / pricing est partiellement unifiée,
- mais certaines vues métier restent encore incomplètes.

## Suite recommandée

1. Documenter précisément les fichiers racine et les stores.
2. Cartographier les endpoints de `unified_api.py` et leurs responsabilités réelles.
3. Comparer chaque onglet frontend avec son contrat API effectif.
4. Identifier ce qui est déjà mutualisé, ce qui est encore spécifique, et ce qui manque.
5. Corriger ensuite les vues incomplètes seulement après cette cartographie.
