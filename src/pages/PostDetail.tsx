import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
import { useSignedImage } from "@/hooks/useSignedImage";
import { POST_STATUS_LABELS, isConfirmedPublished } from "@/lib/publishStatus";
import { useLinkedInTargets } from "@/hooks/useLinkedInTargets";

const PostImage = ({ url }: { url: string }) => {
  const signed = useSignedImage(url);
  if (!signed) return null;
  return (
    <img
      src={signed}
      alt="Post image"
      className="w-full rounded-lg object-cover aspect-video"
    />
  );
};

const PostDetail = () => {
  const { id } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { targets } = useLinkedInTargets();
  const { data: post, isLoading } = useQuery({
    queryKey: ["post", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: jobs } = useQuery({
    queryKey: ["publication_jobs", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("publication_jobs")
        .select("id, status, attempt_count, linkedin_post_urn, error_code, error_message, last_attempt_at, started_at, completed_at, target_id")
        .eq("post_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const publishPost = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("publish-linkedin", {
        body: { postId: id },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      if (!data?.linkedinPostId) {
        toast({ title: "Publication non confirmée", description: "LinkedIn n'a pas renvoyé d'URN.", variant: "destructive" });
        return;
      }
      toast({ title: "Publié", description: `URN LinkedIn : ${data.linkedinPostId}` });
      queryClient.invalidateQueries({ queryKey: ["post", id] });
      queryClient.invalidateQueries({ queryKey: ["publication_jobs", id] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to publish post.";
      const requiresReconnect = message.toLowerCase().includes("reconnect your account") || message.includes("LINKEDIN_TOKEN_EXPIRED");

      toast({
        title: requiresReconnect ? "LinkedIn reconnection required" : "Publish failed",
        description: requiresReconnect ? "Your LinkedIn session expired. Open Settings and reconnect, then retry." : message,
        variant: "destructive",
        action: requiresReconnect ? (
          <ToastAction altText="Open settings" onClick={() => navigate("/settings")}>
            Settings
          </ToastAction>
        ) : undefined,
      });

      queryClient.invalidateQueries({ queryKey: ["post", id] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Post not found</p>
        <Button variant="ghost" asChild className="mt-4">
          <Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Button variant="ghost" asChild className="mb-6">
        <Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-2" /> Back</Link>
      </Button>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Preview */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Post Preview</CardTitle>
              <Badge variant="secondary">
                {isConfirmedPublished(post.status, post.linkedin_post_id) ? "Publié" : (POST_STATUS_LABELS[post.status] || post.status)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {post.image_url && <PostImage url={post.image_url} />}
            <div className="whitespace-pre-wrap text-sm leading-relaxed">
              {post.content}
            </div>
          </CardContent>
        </Card>

        {/* Details */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Title:</span>
                <p className="font-medium">{post.title}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Created:</span>
                <p>{new Date(post.created_at).toLocaleString()}</p>
              </div>
              {post.target_id && (
                <div>
                  <span className="text-muted-foreground">Destination:</span>
                  <p>{targets.find((t) => t.id === post.target_id)?.name || post.target_id}</p>
                </div>
              )}
              {post.scheduled_at && (
                <div>
                  <span className="text-muted-foreground">Programmé pour:</span>
                  <p>{new Date(post.scheduled_at).toLocaleString()}</p>
                </div>
              )}
              {post.published_at && (
                <div>
                  <span className="text-muted-foreground">Exécuté:</span>
                  <p>{new Date(post.published_at).toLocaleString()}</p>
                </div>
              )}
              {post.linkedin_post_id && (
                <div>
                  <span className="text-muted-foreground">URN LinkedIn:</span>
                  <p className="font-mono text-xs break-all">{post.linkedin_post_id}</p>
                </div>
              )}
              {post.error_message && (
                <div>
                  <span className="text-muted-foreground">Erreur:</span>
                  <p className="text-destructive">{post.error_code ? `${post.error_code} — ` : ""}{post.error_message}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {!!jobs?.length && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Tentatives</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {jobs.map((j) => (
                  <div key={j.id} className="border-b last:border-0 pb-2">
                    <p className="font-medium">{j.status} · {j.attempt_count} essai(s)</p>
                    {j.linkedin_post_urn && <p className="font-mono text-xs break-all">{j.linkedin_post_urn}</p>}
                    {j.error_message && <p className="text-destructive text-xs">{j.error_message}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {post.news_summary && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">News Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{post.news_summary}</p>
              </CardContent>
            </Card>
          )}

          {["draft", "ready", "failed", "retrying"].includes(post.status) && (
            <Button
              onClick={() => publishPost.mutate()}
              disabled={publishPost.isPending}
              className="w-full"
              size="lg"
            >
              {publishPost.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {post.status === "failed" ? "Retry publish to LinkedIn" : "Publish to LinkedIn"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PostDetail;
