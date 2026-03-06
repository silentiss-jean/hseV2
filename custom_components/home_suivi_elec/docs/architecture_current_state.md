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

### Vue catalogue exposée

`CatalogueGetView` renvoie directement le store `catalogue` présent dans `hass.data[DOMAIN]`, avec un fallback minimal `{schema_version, generated_at, items, settings}` si rien n’est encore chargé. Cette vue ne reconstruit donc pas un modèle parallèle pour le frontend : elle expose le **store partagé** tel quel.

### Lecture fonctionnelle

Le catalogue n’est donc pas une simple liste brute de détection. C’est déjà un **registre métier persistant** qui stabilise l’identité des capteurs, leur état de santé et une partie du triage, et la vue principale catalogue confirme que l’intention est bien de faire consommer ce socle directement par l’UI plutôt que de dupliquer la logique.

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

## 4) Pricing : rôle actuel

La configuration tarifaire est aujourd’hui portée par l’API `settings/pricing` et stockée dans le catalogue persistant sous `catalogue["settings"]["pricing"]`.

### Modèle actuel observé

Le backend stocke explicitement :

- `contract_type` : `fixed` ou `hphc` ;
- `display_mode` : `ttc` ou `ht` ;
- `subscription_monthly` : paire `{ht, ttc}` ;
- `cost_entity_ids` : liste des entités sélectionnées pour le calcul ;
- selon le contrat, soit `fixed_energy_per_kwh`, soit `hp_energy_per_kwh` + `hc_energy_per_kwh` + `hc_schedule` ;
- `updated_at`.

### Règles déjà en place

- Le backend ne déduit pas la TVA : il exige des valeurs HT et TTC explicites.
- Les `entity_id` sélectionnés sont validés syntaxiquement.
- Le capteur de référence total ne peut pas faire partie de `cost_entity_ids`.
- Des valeurs par défaut existent déjà pour aider l’UI à préremplir un contrat cohérent.

### Lecture fonctionnelle

Le modèle tarifaire est donc déjà **centralisé** côté persistance, même si toutes les vues consommatrices ne l’exploitent pas encore de manière complète.

## 5) API unifiée : rôle actuel

`api/unified_api.py` joue aujourd’hui le rôle de registre central des endpoints HTTP exposés par l’intégration. La structure visible n’est plus celle d’APIs isolées par écran, mais déjà celle d’un routage regroupé par domaines fonctionnels.

### Familles de vues actuellement enregistrées

- **Base panel / disponibilité** : `PingView`, `FrontendManifestView`
- **Scan / catalogue** : `EntitiesScanView`, `CatalogueGetView`, `CatalogueRefreshView`, `CatalogueItemTriageView`, `CatalogueTriageBulkView`, `CatalogueReferenceTotalView`
- **Pricing** : `SettingsPricingView`
- **Meta** : `MetaView`, `MetaSyncPreviewView`, `MetaSyncApplyView`
- **Enrichissement** : `EnrichPreviewView`, `EnrichApplyView`, `EnrichDiagnoseView`, `EnrichCleanupView`
- **Migration / export** : `MigrationExportView`
- **Overview / dashboard** : `DashboardOverviewView`

### Lecture fonctionnelle

L’API unifiée sert déjà de **colonne vertébrale** entre les stores partagés et les onglets UI. La bonne direction n’est donc pas de recréer des backends parallèles, mais d’augmenter la cohérence et le niveau de complétude de cette couche unique.

## 6) Overview : contrat actuel

Le backend `dashboard_overview.py` respecte déjà une intention utile : un endpoint unique pour l’Accueil, tolérant aux données manquantes et capable de renvoyer des `warnings` au lieu d’échouer brutalement.

### Ce que le backend fournit réellement

La vue `/dashboard` renvoie aujourd’hui notamment :

- `pricing` et `defaults` ;
- `selected` avec la liste des `cost_entity_ids` et leur puissance live ;
- `top_live` et `computed.total_power_w` ;
- `reference` et `delta` pour le capteur de référence total ;
- `totals`, `cumulative_table`, `reference_table`, `delta_table` ;
- `per_sensor_costs` ;
- `meta_sync` ;
- `warnings`.

### Ce qui est déjà vivant

- La sélection des capteurs de coût est bien relue depuis le pricing.
- La puissance instantanée est recalculée à partir des états Home Assistant.
- Le capteur de référence total est bien pris en compte pour le delta live.
- Le résumé `meta_sync` est déjà remonté dans le dashboard.

### Ce qui reste vide ou incomplet

Les structures de coûts sont actuellement initialisées mais non calculées :

- `totals.week|month|year` contiennent des champs présents mais à `None` ;
- `cumulative_table`, `reference_table` et `delta_table` sont créés avec le bon schéma, mais sans valeurs ;
- `per_sensor_costs` existe, mais ses colonnes `hour/day/week/month/year` restent à `None`.

### Contrat frontend observé

Le frontend `overview.view.js` est déjà prêt à consommer ces données comme si elles étaient réellement calculées. Il affiche :

- les cartes de coûts globaux semaine / mois / année ;
- les tableaux par période avec `kWh`, `cost_ht`, `cost_ttc`, `total_ht`, `total_ttc` ;
- le tableau `Coûts par capteur` trié par coût journalier ;
- les champs d’abonnement TTC et de total TTC ;
- le delta entre référence externe et somme interne.

### Lecture fonctionnelle

L’overview est donc dans un état de **contrat avancé mais moteur incomplet** : la structure API et l’UI sont déjà dessinées, mais la couche métier de calcul n’alimente pas encore ces champs.

## 7) Enrichissement / migration : état actuel

Les vues d’enrichissement et d’export montrent qu’une partie importante de la logique métier vise déjà à standardiser les entités dérivées plutôt qu’à laisser chaque écran recalculer ses propres conventions.

### Enrich preview

`EnrichPreviewView` prend par défaut la sélection `pricing.cost_entity_ids`, filtre les entités de type `power`, dérive un `base slug`, puis calcule les entités attendues suivantes :

- `sensor.<base>_kwh_total`
- `sensor.<base>_kwh_day`
- `sensor.<base>_kwh_week`
- `sensor.<base>_kwh_month`
- `sensor.<base>_kwh_year`

La vue renvoie ensuite un état de prévisualisation avec `per_source`, `to_create`, `already_ok`, `decisions_required` et un résumé quantitatif. Cela confirme que l’enrichissement est déjà pensé comme une **chaîne normalisée de dérivés énergétiques** à partir des capteurs de puissance sélectionnés.

### Enrich apply / diagnose / cleanup

`EnrichApplyView` montre que l’enrichissement n’est pas resté au stade “prévu”. Il sait déjà tenter une création réelle de helpers Home Assistant via config flows pour `integration` puis `utility_meter`, avec deux modes (`create_helpers` ou `export_yaml`), un `safe_mode`, et une logique `self_heal` pour supprimer des config entries orphelines avant rollback si nécessaire.

`EnrichDiagnoseView` complète ce flux avec une lecture par `base` de l’état du capteur de puissance, du `kwh_total`, des compteurs périodiques, de l’existence en registry/config entry, et de hints de readiness comme “power unknown/unavailable” ou “kWh total encore unknown”.

`EnrichCleanupView` ferme la boucle de remédiation : il sait retrouver, en `dry_run` ou en suppression réelle, des config entries `integration` et `utility_meter` associées aux bases dérivées de la sélection pricing, avec une option `stale_only` pour ne cibler que les entrées orphelines sans entité présente. Cela confirme que la chaîne enrichissement possède déjà un **cycle très avancé preview -> apply -> diagnose -> cleanup**, orienté exploitation, auto-réparation et rollback, pas seulement génération théorique.

### Migration export

`MigrationExportView` relit également le pricing et la sélection courante, reconstruit des `base` par capteur, puis génère plusieurs exports YAML :

- un export `integration` pour créer `sensor.<base>_kwh_total` à partir d’un capteur de puissance ;
- un export `utility_meter` pour créer les compteurs jour / semaine / mois / année ;
- un export de capteurs de coût template pour contrat `fixed` seulement ;
- une option 4 marquée comme non implémentée.

### Lecture fonctionnelle

Cette couche montre déjà une orientation forte : les helpers HSE attendus sont explicitement nommés, la sélection pricing sert de point d’entrée naturel, et la migration/export sert de pont entre l’existant Home Assistant et le modèle cible HSE. La lecture plus complète des fichiers fait apparaître une nuance importante : le flux enrichissement est déjà très avancé sur la création, le diagnostic et le nettoyage des helpers, alors que la partie coût reste encore minimale, dépend du contrat `fixed`, et ne constitue pas encore un moteur complet mutualisé pour l’overview.

## 8) Frontend / thème : état actuel

La couche UI montre déjà une orientation compatible avec ton objectif de continuer à faire évoluer les thèmes via variables CSS plutôt que par styles figés.

### Panel CSS

`style.hse.panel.css` définit un petit ensemble de variables HSE de base au niveau `:host`, comme `--hse_bg`, `--hse_fg`, `--hse_muted`, `--hse_border`, `--hse_card_bg`, `--hse_accent`, `--hse_danger`, puis construit les composants du panel (`card`, `button`, `input`, `table`, etc.) à partir de ces variables. Les couleurs ne sont donc pas codées en dur pour les composants principaux ; elles sont déjà dérivées d’un niveau d’abstraction HSE.

### Couche d’alias

`hse_alias.v2.css` montre une seconde couche importante : des alias HSE “v2” sont rebranchés vers les variables “v1”, par exemple `--hse_border -> --hse-border`, `--hse_muted -> --hse-text-muted`, `--hse_card_bg -> --hse-surface`, `--hse_accent -> --hse-accent`, `--hse_radius -> --hse-radius-lg`. Cela confirme que le système de thème est prévu pour évoluer par ajout d’alias et de tokens, plutôt que par réécriture brutale des vues.

### Lecture fonctionnelle

Pour continuer à coder l’UI proprement, la bonne pratique est donc de prolonger ce modèle :

- ajouter de nouvelles variables HSE quand un besoin visuel est récurrent ;
- brancher ces variables dans la couche d’alias/tokens plutôt que d’introduire des couleurs ou espacements en dur dans les vues ;
- garder les composants JS et les écrans dépendants des tokens, pas des valeurs finales.

Cette lecture va bien dans le sens de ce que tu décris : les thèmes custom ne sont pas figés, et la dette à éviter est surtout l’introduction de styles locaux non tokenisés.

## 9) Implication pour l’unification

L’état actuel montre que l’intégration a déjà amorcé le bon mouvement :

- un runtime central ;
- des stores partagés ;
- une API unifiée ;
- un panel unique ;
- un modèle pricing stocké dans le catalogue ;
- une convention d’enrichissement et d’export déjà partiellement normalisée ;
- une couche UI déjà compatible avec une évolution par tokens CSS.

Le problème n’est donc plus “tout est éclaté”, mais plutôt “certaines vues utilisent déjà bien ce socle, d’autres ne l’exploitent pas encore complètement”.

## 10) Point déjà identifié sur l’overview

L’onglet **Accueil / overview** consomme bien `GET /api/home_suivi_elec/unified/dashboard`, mais `dashboard_overview.py` renvoie aujourd’hui une structure de coûts largement vide (`None`) alors que le frontend sait déjà afficher ces champs.

Cela suggère un état intermédiaire :

- la structure de centralisation existe ;
- la chaîne scan / enrich / pricing est partiellement unifiée ;
- mais certaines vues métier restent encore incomplètes.

## 11) Suite recommandée

1. Documenter précisément les stores `catalogue` et `meta`.
2. Cartographier `unified_api.py` et les responsabilités réelles de chaque vue.
3. Comparer chaque onglet frontend avec son contrat API effectif.
4. Identifier ce qui est déjà mutualisé, ce qui est encore spécifique, et ce qui manque.
5. Corriger ensuite les vues incomplètes seulement après cette cartographie.
