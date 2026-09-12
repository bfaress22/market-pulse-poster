export const POST_STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  ready: "Prêt",
  scheduled: "Programmé",
  queued: "En file",
  generating: "Génération",
  processing: "En cours",
  retrying: "Nouvel essai",
  published: "Publié",
  failed: "Échec",
};

export const JOB_STATUS_LABELS: Record<string, string> = {
  queued: "En file",
  processing: "En cours",
  retrying: "Nouvel essai",
  success: "Publié",
  failed: "Échec",
  skipped: "Ignoré",
};

export const POST_STATUS_BADGE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  generating: "bg-accent/20 text-accent-foreground",
  ready: "bg-primary/10 text-primary",
  scheduled: "bg-accent/15 text-accent-foreground",
  queued: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  processing: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  retrying: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  published: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
  failed: "bg-destructive/10 text-destructive",
};

export function isConfirmedPublished(status: string, linkedinPostId?: string | null): boolean {
  return status === "published" && !!linkedinPostId;
}
