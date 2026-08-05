# Multi-comptes LinkedIn + automatisation renforcée

## Constat actuel

- L'identité LinkedIn est stockée dans `user_settings` (une seule : `linkedin_access_token`, `linkedin_person_urn`, `linkedin_organization_id`). Impossible de gérer plusieurs pages.
- Les scopes demandés dans `linkedin-oauth` sont strictement personnels (`openid profile w_member_social email`) — aucune page d'entreprise n'est découverte.
- `posts`, `schedules` et `topic_queue` n'ont aucune notion de destination : la publication cible toujours l'unique identité, avec repli automatique sur le profil personnel.
- La logique de publication est dupliquée dans `publish-linkedin`, `publish-scheduled`, `run-schedules`, `run-topic-queue`.

## Ce qui va être construit

### 1. Destinations LinkedIn (Settings)

Nouvelle section « Destinations LinkedIn » listant toutes les cibles connectées :

- Un bouton « Connecter un compte / une page » lance le flux OAuth. Après connexion, l'app récupère le profil personnel **et** les pages dont l'utilisateur est administrateur, puis crée une destination par cible.
- Chaque carte affiche : nom, type (Profil / Page), avatar, badge d'état (Connecté / Expire bientôt / Expiré), date d'expiration du jeton.
- Actions par destination : définir comme destination par défaut, reconnecter, supprimer.
- Plusieurs comptes LinkedIn différents peuvent être connectés successivement (chaque passage OAuth ajoute ses cibles sans écraser les précédentes).
- Les pages ne sont proposées que si l'app LinkedIn de l'utilisateur possède les droits nécessaires ; sinon un message clair explique la limite au lieu d'un échec silencieux.

### 2. Sélecteur de destination partout où l'on publie

- **Composer** : un sélecteur « Publier sur » (destination par défaut pré-sélectionnée) visible pour la publication immédiate, la programmation et la création d'automatisation. Possibilité de choisir **plusieurs destinations** pour un même contenu.
- **Schedules** : chaque automatisation mémorise sa/ses destinations, affichées dans la liste.
- **Sujets en attente** : même sélecteur au moment d'ajouter un sujet.
- **Dashboard / détail de post** : affichage de la destination sur laquelle le post est parti.

### 3. Automatisation renforcée

- **Publication multi-destinations** : un contenu programmé peut partir sur plusieurs pages (un post enregistré par destination pour garder l'historique).
- **Fiabilité** : nouvelles tentatives automatiques en cas d'échec temporaire LinkedIn, avec statut `retrying` puis `failed` après épuisement, et raison lisible dans l'historique.
- **Garde-fous** : si le jeton d'une destination est expiré, l'exécution est mise en pause pour cette destination et signalée dans le tableau de bord au lieu d'échouer en boucle.
- **Historique unifié** : les exécutions d'automatisations et de file d'attente alimentent une seule vue « Historique d'exécution » (succès, échec, destination, message).
- **Contrôles d'automatisation** : activer/désactiver et « exécuter maintenant » pour chaque automatisation et chaque sujet en attente, avec affichage de la prochaine exécution.
- **Anti-doublons** : réutilisation du hachage de contenu existant pour éviter de republier deux fois le même sujet sur la même destination.

## Détails techniques

- **Base de données**
  - Nouvelle table `linkedin_targets` : `user_id`, `kind` (`person` | `organization`), `urn`, `name`, `avatar_url`, `access_token`, `refresh_token`, `token_expires_at`, `scopes`, `is_default`, `status`. RLS par propriétaire + GRANT `authenticated`/`service_role`.
  - `posts.target_id`, `schedules.target_ids uuid[]`, `topic_queue.target_ids uuid[]`.
  - `schedule_runs` étendu avec `target_id`, `attempt`, `source` (`schedule` | `topic_queue`).
  - Les champs `linkedin_*` de `user_settings` restent en place pour la compatibilité et sont migrés une fois vers `linkedin_targets`.
- **Edge functions**
  - `linkedin-oauth` : ajout des scopes organisation lorsque disponibles, appel `organizationAcls` pour lister les pages administrées, création/mise à jour des lignes `linkedin_targets`.
  - Nouveau module partagé `supabase/functions/_shared/linkedin.ts` : upload d'image par propriétaire, construction du corps `ugcPosts`, publication et normalisation des erreurs — utilisé par `publish-linkedin`, `publish-scheduled`, `run-schedules`, `run-topic-queue` (suppression de la duplication).
  - Publication ciblée par `target_id` ; suppression du repli implicite vers le profil personnel (l'utilisateur choisit explicitement).
- **Frontend** : nouveau composant `TargetSelect`, hook `useLinkedInTargets`, intégré dans Composer, Schedules, TopicQueue, Settings.
