import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowUpRight, Clock3, Film, Loader2, LockKeyhole, Search, Sparkles, WandSparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const statusTone: Record<string, string> = {
  draft: "bg-white/5 text-white/60",
  planning: "bg-amber-400/10 text-amber-200",
  ready: "bg-emerald-400/10 text-emerald-200",
  generating: "bg-violet-400/10 text-violet-200",
  completed: "bg-emerald-400/10 text-emerald-200",
  failed: "bg-red-400/10 text-red-200",
};

export default function Home() {
  const [, navigate] = useLocation();
  const projects = trpc.studio.list.useQuery();
  const providers = trpc.providers.list.useQuery();
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(65);
  const [providerMode, setProviderMode] = useState<"automatic" | "manual">("automatic");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const filteredProjects = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    if (!query) return projects.data ?? [];
    return (projects.data ?? []).filter(project => `${project.name} ${project.prompt}`.toLowerCase().includes(query));
  }, [historySearch, projects.data]);
  const create = trpc.studio.create.useMutation({
    onSuccess: project => project && navigate(`/projects/${project.id}`),
    onError: error => toast.error(error.message),
  });

  const submit = () => create.mutate({
    name: name.trim() || "Untitled vertical story",
    prompt,
    targetDurationSeconds: Math.max(61, duration),
    videoProviderMode: providerMode,
    selectedVideoProviderKey: providerMode === "manual" ? selectedProvider : undefined,
  });

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1480px] space-y-6">
        <section className="studio-hero relative overflow-hidden rounded-[2rem] p-6 sm:p-9 lg:p-12">
          <div className="relative z-10 grid gap-10 lg:grid-cols-[1.1fr_.9fr] lg:items-end">
            <div className="max-w-3xl">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white/70 backdrop-blur">
                <LockKeyhole className="h-3.5 w-3.5 text-primary" /> Owner-only studio
              </div>
              <h1 className="font-display text-5xl leading-[.95] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
                Turn a reference into a <span className="italic text-primary">moving story.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-white/58 sm:text-lg">
                Plan and assemble polished vertical stories with a provider-neutral pipeline. Every timeline is designed to clear the one-minute mark.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[["9:16", "Vertical"], ["61s+", "Duration"], [String(providers.data?.length ?? 0), "Renderers"]].map(([value, label]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur-sm">
                  <p className="font-display text-2xl text-white">{value}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/42">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.03fr_.97fr]">
          <Card className="studio-panel border-white/[.07] bg-card/75 shadow-2xl shadow-black/20">
            <CardContent className="p-6 sm:p-8">
              <div className="mb-7 flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">New production</p>
                  <h2 className="mt-2 font-display text-3xl">Begin with an idea</h2>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <WandSparkles className="h-5 w-5" />
                </div>
              </div>
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="project-name">Project title</Label>
                  <Input id="project-name" value={name} onChange={event => setName(event.target.value)} placeholder="Midnight in the glasshouse" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between"><Label htmlFor="prompt">Creative direction</Label><span className="text-xs text-muted-foreground">{prompt.length}/12,000</span></div>
                  <Textarea id="prompt" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Describe the subject, atmosphere, camera language, movement, visual continuity, and ending..." className="min-h-40 resize-none" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="duration">Target duration</Label>
                    <div className="relative"><Input id="duration" type="number" min={61} max={300} value={duration} onChange={event => setDuration(Math.max(61, Number(event.target.value) || 61))} /><span className="pointer-events-none absolute right-3 top-2.5 text-xs text-muted-foreground">seconds</span></div>
                  </div>
                  <div className="space-y-2">
                    <Label>Provider strategy</Label>
                    <Select value={providerMode} onValueChange={value => setProviderMode(value as "automatic" | "manual")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="automatic">Automatic fallback chain</SelectItem><SelectItem value="manual" disabled={!providers.data?.length}>Choose manually</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                {providerMode === "manual" && (
                  <div className="space-y-2"><Label>Video provider</Label><Select value={selectedProvider} onValueChange={setSelectedProvider}><SelectTrigger><SelectValue placeholder="Choose a configured renderer" /></SelectTrigger><SelectContent>{providers.data?.map(provider => <SelectItem key={provider.id} value={provider.id}>{provider.label}</SelectItem>)}</SelectContent></Select></div>
                )}
                <Button size="lg" className="w-full" disabled={prompt.trim().length < 12 || create.isPending || (providerMode === "manual" && !selectedProvider)} onClick={submit}>
                  {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} Create private project
                </Button>
              </div>
            </CardContent>
          </Card>

          <section className="space-y-4">
            <div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-end sm:justify-between">
              <div><p className="eyebrow">Private archive</p><h2 className="mt-2 font-display text-3xl">Recent projects</h2></div>
              <div className="flex items-center gap-2"><div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" /><Input value={historySearch} onChange={event => setHistorySearch(event.target.value)} placeholder="Search archive" className="h-9 w-full pl-9 sm:w-44" /></div><Badge variant="outline" className="shrink-0 border-white/10 text-muted-foreground">{projects.data?.length ?? 0} saved</Badge></div>
            </div>
            {projects.isLoading ? <div className="grid place-items-center rounded-3xl border border-white/[.06] bg-card/50 py-24"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : projects.data?.length ? (
              <div className="grid gap-3">
                {filteredProjects.slice(0, 10).map(project => (
                  <button key={project.id} onClick={() => navigate(`/projects/${project.id}`)} className="group flex w-full items-center gap-4 rounded-3xl border border-white/[.07] bg-card/70 p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card">
                    <div className="flex h-16 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-fuchsia-400/10 text-primary"><Film className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="truncate font-semibold">{project.name}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${statusTone[project.status]}`}>{project.status}</span></div><p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{project.prompt}</p><div className="mt-2 flex items-center gap-3 text-xs text-white/35"><span className="flex items-center gap-1"><Clock3 className="h-3 w-3" /> {project.targetDurationSeconds}s</span><span>{new Date(project.updatedAt).toLocaleDateString()}</span></div></div>
                    <ArrowUpRight className="h-4 w-4 text-white/25 transition group-hover:text-primary" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-card/35 px-8 text-center"><Film className="mb-4 h-7 w-7 text-primary" /><h3 className="font-display text-2xl">Your first story starts here</h3><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Create a project, upload visual references, then generate a reusable multi-clip plan.</p></div>
            )}
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
