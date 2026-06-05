"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Input,
  Select,
  SelectItem,
  Autocomplete,
  AutocompleteItem,
  Switch,
  Button,
  Spinner,
  Textarea,
} from "@heroui/react";
import { Plus, Trash2, Check, ArrowRight } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { ImageUpload } from "@/components/shared/image-upload";
import { useSpaceActions } from "@/lib/stores/space-store";
import { CURRENCIES, CURRENCY_PRIMARY_COUNTRY } from "@/lib/data/currencies";
import { COUNTRIES, flagEmoji } from "@/lib/data/countries";

const TEAM_SIZES = ["Just me", "2–10", "11–50", "50+"];
const GOALS = ["Sell online", "Sell in person (POS)", "Track finances", "Plan meals", "All of the above"];
const REFERRALS = ["Instagram", "Google", "Friend / colleague", "X / Twitter", "Other"];
const INVITE_ROLES = [
  { id: "admin", label: "Admin" },
  { id: "commerce_manager", label: "Commerce manager" },
  { id: "cashier", label: "Cashier" },
  { id: "viewer", label: "Viewer" },
];

const STEP_META = [
  { title: "Workspace", desc: "Name and basics" },
  { title: "Profile", desc: "Your store identity" },
  { title: "About you", desc: "Help us tailor things" },
  { title: "Team & storefront", desc: "Invite and go live" },
];

const HEADINGS = [
  { h: "Tell us about your business", s: "We'll use this to set up your workspace." },
  { h: "Your store profile", s: "Add your branding and contact details." },
  { h: "A little about you", s: "This helps us tailor your experience." },
  { h: "Invite your team & storefront", s: "Bring people in and go live — all optional." },
];

// Shared field styling: bordered with floating inside labels for even rhythm.
const fieldProps = {
  variant: "bordered" as const,
  labelPlacement: "inside" as const,
  size: "lg" as const,
  radius: "lg" as const,
};

interface InviteRow {
  email: string;
  role: string;
}

export function OnboardingWizard() {
  const router = useRouter();
  const { updateSpace } = useSpaceActions();

  const [loading, setLoading] = useState(true);
  const [spaceId, setSpaceId] = useState<string>("");
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step state
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"commerce" | "internal">("commerce");
  const [currency, setCurrency] = useState("USD");
  const [country, setCountry] = useState("");
  // Bumped to remount the (uncontrolled) country field when currency pre-fills it.
  const [countryFieldKey, setCountryFieldKey] = useState(0);

  // Selecting a currency pre-fills the matching country; the user can still
  // change the country independently afterward.
  function handleCurrencyChange(code: string) {
    setCurrency(code);
    const cc = CURRENCY_PRIMARY_COUNTRY[code];
    const match = cc ? COUNTRIES.find((c) => c.code === cc) : undefined;
    if (match) {
      setCountry(match.name);
      setCountryFieldKey((k) => k + 1);
    }
  }

  const [storeName, setStoreName] = useState("");
  const [storeLogo, setStoreLogo] = useState<string | null>(null);
  const [storeAddress, setStoreAddress] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [storeEmail, setStoreEmail] = useState("");

  const [teamSize, setTeamSize] = useState("");
  const [goal, setGoal] = useState("");
  const [referral, setReferral] = useState("");
  const [seedSample, setSeedSample] = useState(true);

  const [storefrontEnabled, setStorefrontEnabled] = useState(false);
  const [tagline, setTagline] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [instagram, setInstagram] = useState("");
  const [invites, setInvites] = useState<InviteRow[]>([{ email: "", role: "viewer" }]);

  // Load resume state
  useEffect(() => {
    let active = true;
    fetch("/api/onboarding")
      .then((r) => r.json())
      .then((json) => {
        if (!active) return;
        if (!json.success) {
          router.replace("/home");
          return;
        }
        const { space, settings } = json.data;
        setSpaceId(space.id);
        setName(space.name?.replace(/'s Space$/, "") ?? "");
        setMode(space.mode ?? "commerce");
        setStorefrontEnabled(space.storefrontEnabled ?? false);
        if (settings) {
          setCurrency(settings.currency ?? "USD");
          setStoreName(settings.storeName ?? "");
          setStoreLogo(settings.storeLogo || null);
          setStoreAddress(settings.storeAddress ?? "");
          setStorePhone(settings.storePhone ?? "");
          setStoreEmail(settings.storeEmail ?? "");
          setTagline(settings.storefrontTagline ?? "");
          setWhatsapp(settings.whatsappNumber ?? "");
          setInstagram(settings.socialInstagram ?? "");
        }
        const meta = space.onboardingMeta ?? {};
        if (typeof meta.country === "string") setCountry(meta.country);
        if (typeof meta.teamSize === "string") setTeamSize(meta.teamSize);
        if (typeof meta.goal === "string") setGoal(meta.goal);
        if (typeof meta.referral === "string") setReferral(meta.referral);
        const done: string[] = Array.isArray(meta.completedSteps) ? meta.completedSteps : [];
        const order = ["workspace", "profile", "personalization", "storefront"];
        const firstIncomplete = order.findIndex((k) => !done.includes(k));
        setStep(firstIncomplete === -1 ? STEP_META.length - 1 : firstIncomplete);
      })
      .catch(() => active && setError("Failed to load onboarding"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [router]);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch("/api/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spaceId, ...body }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || "Failed to save");
    }
    return json.data as { onboardedAt: string | null };
  }

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      await patch({
        storefront: {
          enabled: storefrontEnabled,
          tagline,
          whatsappNumber: whatsapp,
          socialInstagram: instagram,
        },
        completedSteps: ["storefront"],
      });
      await sendInvites();
      const data = await patch({ complete: true, completedSteps: ["storefront"] });
      updateSpace(spaceId, {
        onboardedAt: data.onboardedAt ?? new Date().toISOString(),
      });
      router.replace("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to finish");
      setSaving(false);
    }
  }

  async function sendInvites() {
    const valid = invites.filter((i) => i.email.includes("@"));
    await Promise.all(
      valid.map((i) =>
        fetch("/api/system/invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spaceId, email: i.email.trim().toLowerCase(), role: i.role }),
        }).catch(() => null)
      )
    );
  }

  async function skipToApp() {
    setSaving(true);
    setError(null);
    try {
      const data = await patch({ complete: true });
      updateSpace(spaceId, {
        onboardedAt: data.onboardedAt ?? new Date().toISOString(),
      });
      router.replace("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to finish");
      setSaving(false);
    }
  }

  async function next() {
    setSaving(true);
    setError(null);
    try {
      if (step === 0) {
        await patch({
          workspace: { name, mode, currency, country },
          completedSteps: ["workspace"],
        });
      } else if (step === 1) {
        await patch({
          profile: { storeName, storeLogo: storeLogo ?? "", storeAddress, storePhone, storeEmail },
          completedSteps: ["profile"],
        });
      } else if (step === 2) {
        await patch({
          personalization: { teamSize, goal, referral, seedSampleData: seedSample },
          completedSteps: ["personalization"],
        });
      }
      setStep((s) => s + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const heading = HEADINGS[step];

  return (
    <div className="min-h-screen flex bg-white dark:bg-gray-950">
      {/* Left brand + vertical stepper */}
      <aside className="hidden lg:flex lg:w-[42%] xl:w-[36%] flex-col justify-between bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-12 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-white/[0.03] rounded-full" />
          <div className="absolute bottom-0 right-0 w-[28rem] h-[28rem] bg-blue-500/[0.06] rounded-full translate-x-1/3 translate-y-1/3" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <Logo variant="dark" className="w-9 h-9" />
            <span className="font-semibold text-lg">DailyOS</span>
          </div>

          <h1 className="text-3xl font-bold leading-tight mb-3 max-w-xs">
            Let&apos;s get your workspace ready
          </h1>
          <p className="text-slate-300 mb-12 max-w-xs">
            A few quick steps and you&apos;ll be running your store.
          </p>

          <ol className="space-y-1">
            {STEP_META.map((s, i) => {
              const state = i < step ? "done" : i === step ? "active" : "todo";
              return (
                <li key={s.title} className="flex gap-4 items-start py-3">
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold shrink-0 transition-colors ${
                      state === "done"
                        ? "bg-blue-500 text-white"
                        : state === "active"
                        ? "bg-white text-slate-900"
                        : "bg-white/10 text-slate-400"
                    }`}
                  >
                    {state === "done" ? <Check className="w-4 h-4" /> : i + 1}
                  </div>
                  <div className="pt-1">
                    <p
                      className={`font-medium leading-none ${
                        state === "todo" ? "text-slate-400" : "text-white"
                      }`}
                    >
                      {s.title}
                    </p>
                    <p className="text-sm text-slate-400 mt-1">{s.desc}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <p className="relative z-10 text-xs text-slate-500">
          You can change all of this later in Settings.
        </p>
      </aside>

      {/* Right form panel */}
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Mobile header */}
        <div className="lg:hidden px-6 pt-6">
          <div className="flex items-center gap-2 mb-4">
            <Logo className="w-8 h-8" />
            <span className="font-semibold">DailyOS</span>
          </div>
          <div className="flex gap-1.5 mb-2">
            {STEP_META.map((s, i) => (
              <div
                key={s.title}
                className={`h-1.5 flex-1 rounded-full ${
                  i <= step ? "bg-blue-500" : "bg-gray-200 dark:bg-gray-800"
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-gray-500">
            Step {step + 1} of {STEP_META.length} · {STEP_META[step].title}
          </p>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-md">
            <p className="hidden lg:block text-sm font-medium text-blue-600 dark:text-blue-400 mb-2">
              Step {step + 1} of {STEP_META.length}
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
              {heading.h}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mt-2 mb-8">{heading.s}</p>

            {step === 0 && (
              <div className="space-y-5">
                <Input
                  {...fieldProps}
                  label="Business name"
                  placeholder="e.g. Bella Boutique"
                  value={name}
                  onValueChange={setName}
                  isRequired
                />
                <Select
                  {...fieldProps}
                  label="What will you use DailyOS for?"
                  selectedKeys={[mode]}
                  onChange={(e) => setMode(e.target.value as "commerce" | "internal")}
                >
                  <SelectItem key="commerce">Run a store / commerce</SelectItem>
                  <SelectItem key="internal">Personal / internal use</SelectItem>
                </Select>
                <Autocomplete
                  {...fieldProps}
                  label="Currency"
                  defaultSelectedKey={currency}
                  onSelectionChange={(key) => {
                    if (key) handleCurrencyChange(String(key));
                  }}
                  defaultItems={CURRENCIES}
                >
                  {(c) => (
                    <AutocompleteItem key={c.code} textValue={`${c.code} ${c.name}`}>
                      <span className="flex items-center gap-2">
                        <span className="inline-block w-10 text-default-500">{c.symbol}</span>
                        <span className="font-medium">{c.code}</span>
                        <span className="text-default-400">— {c.name}</span>
                      </span>
                    </AutocompleteItem>
                  )}
                </Autocomplete>
                <Autocomplete
                  key={countryFieldKey}
                  {...fieldProps}
                  label="Country"
                  placeholder="Search countries (optional)"
                  defaultSelectedKey={country || undefined}
                  onSelectionChange={(key) => setCountry(key ? String(key) : "")}
                  defaultItems={COUNTRIES}
                >
                  {(c) => (
                    <AutocompleteItem key={c.name} textValue={c.name}>
                      <span className="flex items-center gap-2">
                        <span>{flagEmoji(c.code)}</span>
                        <span>{c.name}</span>
                      </span>
                    </AutocompleteItem>
                  )}
                </Autocomplete>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Logo</p>
                  <ImageUpload
                    value={storeLogo}
                    onChange={setStoreLogo}
                    spaceId={spaceId}
                    entity="branding"
                    label="Upload logo"
                  />
                </div>
                <Input {...fieldProps} label="Store name" value={storeName} onValueChange={setStoreName} />
                <Input {...fieldProps} label="Address" value={storeAddress} onValueChange={setStoreAddress} />
                <Input {...fieldProps} label="Phone" value={storePhone} onValueChange={setStorePhone} />
                <Input {...fieldProps} label="Public email" type="email" value={storeEmail} onValueChange={setStoreEmail} />
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <Select {...fieldProps} label="Team size" selectedKeys={teamSize ? [teamSize] : []} onChange={(e) => setTeamSize(e.target.value)}>
                  {TEAM_SIZES.map((t) => (
                    <SelectItem key={t}>{t}</SelectItem>
                  ))}
                </Select>
                <Select {...fieldProps} label="Main goal" selectedKeys={goal ? [goal] : []} onChange={(e) => setGoal(e.target.value)}>
                  {GOALS.map((g) => (
                    <SelectItem key={g}>{g}</SelectItem>
                  ))}
                </Select>
                <Select {...fieldProps} label="How did you hear about us?" selectedKeys={referral ? [referral] : []} onChange={(e) => setReferral(e.target.value)}>
                  {REFERRALS.map((r) => (
                    <SelectItem key={r}>{r}</SelectItem>
                  ))}
                </Select>
                <div className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">Add sample products</p>
                    <p className="text-sm text-gray-500">Explore with example data you can delete later.</p>
                  </div>
                  <Switch isSelected={seedSample} onValueChange={setSeedSample} />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Invite teammates (optional)</p>
                  {invites.map((row, i) => (
                    <div key={i} className="flex gap-2 items-end">
                      <Input
                        {...fieldProps}
                        className="flex-1"
                        aria-label="Teammate email"
                        type="email"
                        placeholder="teammate@email.com"
                        value={row.email}
                        onValueChange={(v) =>
                          setInvites((arr) => arr.map((r, j) => (j === i ? { ...r, email: v } : r)))
                        }
                      />
                      <Select
                        {...fieldProps}
                        className="w-40"
                        aria-label="Teammate role"
                        selectedKeys={[row.role]}
                        onChange={(e) =>
                          setInvites((arr) => arr.map((r, j) => (j === i ? { ...r, role: e.target.value } : r)))
                        }
                      >
                        {INVITE_ROLES.map((r) => (
                          <SelectItem key={r.id}>{r.label}</SelectItem>
                        ))}
                      </Select>
                      {invites.length > 1 && (
                        <Button isIconOnly variant="light" className="mb-0.5" onPress={() => setInvites((arr) => arr.filter((_, j) => j !== i))}>
                          <Trash2 size={18} />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="light"
                    startContent={<Plus size={16} />}
                    onPress={() => setInvites((arr) => [...arr, { email: "", role: "viewer" }])}
                  >
                    Add another
                  </Button>
                </div>

                <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">Enable storefront</p>
                      <p className="text-sm text-gray-500">Let customers browse and order online.</p>
                    </div>
                    <Switch isSelected={storefrontEnabled} onValueChange={setStorefrontEnabled} />
                  </div>
                  {storefrontEnabled && (
                    <div className="space-y-4 pt-2">
                      <Textarea {...fieldProps} label="Tagline" value={tagline} onValueChange={setTagline} />
                      <Input {...fieldProps} label="WhatsApp number" value={whatsapp} onValueChange={setWhatsapp} />
                      <Input {...fieldProps} label="Instagram handle" value={instagram} onValueChange={setInstagram} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="mt-5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 px-4 py-3">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between mt-10">
              {step > 0 ? (
                <Button variant="light" onPress={() => setStep((s) => s - 1)} isDisabled={saving}>
                  Back
                </Button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                {step > 0 && step < 3 && (
                  <Button variant="light" onPress={() => setStep((s) => s + 1)} isDisabled={saving}>
                    Skip
                  </Button>
                )}
                {step === 0 && (
                  <Button color="primary" size="lg" onPress={next} isLoading={saving} isDisabled={!name.trim()} endContent={!saving && <ArrowRight size={18} />}>
                    Continue
                  </Button>
                )}
                {(step === 1 || step === 2) && (
                  <Button color="primary" size="lg" onPress={next} isLoading={saving} endContent={!saving && <ArrowRight size={18} />}>
                    Continue
                  </Button>
                )}
                {step === 3 && (
                  <Button color="primary" size="lg" onPress={finish} isLoading={saving}>
                    Finish setup
                  </Button>
                )}
              </div>
            </div>

            {step > 0 && (
              <div className="mt-8 text-center lg:text-left">
                <button
                  type="button"
                  onClick={skipToApp}
                  disabled={saving}
                  className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer disabled:cursor-not-allowed"
                >
                  Skip setup and go to dashboard
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
