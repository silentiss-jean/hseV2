# Architecture actuelle (audit initial)

> État observé avant correction fonctionnelle. Cette note sert de point d’entrée pour remettre la documentation à jour et préparer une unification progressive du backend.

## Vue d’ensemble

L’intégration est déjà structurée autour de quatre couches principales :

1. **Bootstrap / runtime** : `__init__.py`
2. **Stores partagés** : `catalogue_*`, `meta_*`
3. **API unifiée** : `api/unified_api.py` + `api/views/*`
4. **Panel frontend** : `web_static/panel/*`

## 1) Bootstrap / runtime

Le point d’entrée `__init__.py` fait aujourd’hui plusieurs choses structurantes :

- enregistre l’API unifiée ;
- expose les assets statiques du panel ;
- enregistre un panel HA unique (`hse-panel`) ;
- charge et persiste les stores `catalogue` et `meta` ;
- lance deux boucles périodiques : refresh catalogue et meta sync.

### Conséquence d’architecture

Le runtime ne se contente plus d’exposer des vues isolées : il met déjà en place un **socle partagé** pour l’ensemble des onglets. La doc future doit donc partir de cette réalité et non d’une lecture “un onglet = un backend indépendant”.

## 2) Catalogue : rôle actuel

Le refresh catalogue scanne les `sensor.*`, détecte leur nature (`power` / `energy`), ignore les entités HSE générées, puis construit un payload de scan fusionné dans le store persistant.

### Ce que fait `catalogue_manager.merge_scan_into_catalogue`

La fusion repose sur une logique d’item persistant :

- chaque item a un identifiant stable dérivé du registre (`reg:{platform}:{unique_id}`) ou, à défaut, de l’`entity_id` ;
- la source observée met à jour les champs techniques (`entity_id`, `kind`, `unit`, `device_class`, `integration_domain`, `status`, etc.) ;
- la santé (`health`) est recalculée à chaque scan ;
- une escalade est produite selon le temps d’indisponibilité (`none`, `warning_15m`, `error_24h`, `action_48h`) ;
- un item marqué `triage.policy = removed` ne garde jamais d’escalade active.

### Lecture fonctionnelle

Le catalogue n’est donc pas une simple liste brute de détection. C’est déjà un **registre métier persistant** qui stabilise l’identité des capteurs, leur état de santé et une partie du triage.

## 3) Meta : rôle actuel

Le bloc `meta` constitue un second store partagé, distinct du catalogue. Il sert à suivre la structure HA (areas, entités, affectations) et à produire des suggestions d’alignement sans écraser brutalement les choix manuels.

### Ce que fait `meta_sync`

`async_build_ha_snapshot` extrait un snapshot des areas et des `sensor.*` présents dans l’entity registry. `compute_pending_diff` compare ensuite ce snapshot au store `meta` et produit :

- des salles à créer (`rooms.create`) ;
- des salles à renommer (`rooms.rename`) ;
- des suggestions d’affectation de capteurs à une salle (`assignments.suggest_room`).

### Règles importantes

- Les IDs de room auto dérivent des `area_id` Home Assistant (`ha_<area_id normalisé>`).
- Les renommages auto respectent les cas manuels via `name_mode`.
- Les affectations de room respectent aussi le mode manuel via `room_mode`.
- `apply_pending_diff` applique ensuite ces changements en mode `auto` ou `all`.

### Lecture fonctionnelle

Le store `meta` joue déjà le rôle d’une **couche d’interprétation** entre Home Assistant brut et la représentation métier utilisée par l’UI.

## 4) Implication pour l’unification

L’état actuel montre que l’intégration a déjà amorcé le bon mouvement :

- un runtime central ;
- des stores partagés ;
- une API unifiée ;
- un panel unique.

Le problème n’est donc plus “tout est éclaté”, mais plutôt “certaines vues utilisent déjà bien ce socle, d’autres ne l’exploitent pas encore complètement”.

## 5) Point déjà identifié sur l’overview

L’onglet **Accueil / overview** consomme bien `GET /api/home_suivi_elec/unified/dashboard`, mais `dashboard_overview.py` renvoie aujourd’hui une structure de coûts largement vide (`None`) alors que le frontend sait déjà afficher ces champs.

Cela suggère un état intermédiaire :

- la structure de centralisation existe ;
- la chaîne scan / enrich / pricing est partiellement unifiée ;
- mais certaines vues métier restent encore incomplètes.

## 6) Suite recommandée

1. Documenter précisément les stores `catalogue` et `meta`.
2. Cartographier `unified_api.py` et les responsabilités réelles de chaque vue.
3. Comparer chaque onglet frontend avec son contrat API effectif.
4. Identifier ce qui est déjà mutualisé, ce qui est encore spécifique, et ce qui manque.
5. Corriger ensuite les vues incomplètes seulement après cette cartographie.
