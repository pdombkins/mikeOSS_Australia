"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Eye, EyeOff, KeyRound, Trash2 } from "lucide-react";
import { Input } from "@/app/components/ui/input";
import { useUserProfile } from "@/app/contexts/UserProfileContext";
import {
    MfaVerificationPopup,
    needsMfaVerification,
} from "@/app/components/popups/MfaVerificationPopup";
import { isMfaRequiredError } from "@/app/lib/mikeApi";
import {
    accountGlassIconButtonClassName,
    accountGlassInputClassName,
} from "../accountStyles";
import {
    createPat,
    listPats,
    revokePat,
    type Pat,
} from "@/app/lib/mikeApi";
import { AccountSection } from "../AccountSection";

const MODEL_API_KEY_FIELDS = [
    {
        provider: "claude",
        label: "Anthropic (Claude) API Key",
        placeholder: "sk-ant-...",
    },
    {
        provider: "gemini",
        label: "Google (Gemini) API Key",
        placeholder: "AI...",
    },
    {
        provider: "openai",
        label: "OpenAI API Key",
        placeholder: "sk-...",
    },
    {
        provider: "openrouter",
        label: "OpenRouter API Key",
        placeholder: "sk-or-...",
    },
    {
        provider: "moonshot",
        label: "Moonshot (Kimi K3) API Key",
        placeholder: "sk-...",
        description:
            "Only needed for Moonshot's hosted API (data processed offshore). Not required when the operator has configured a self-hosted Kimi K3 endpoint.",
    },
] as const;

const OTHER_API_KEY_FIELDS = [
    {
        provider: "courtlistener",
        label: "CourtListener API Key",
        placeholder: "Token...",
        description:
            "Add a CourtListener API key if you want the latest CourtListener data. Otherwise, Mike will use the bulk data hosted by us.",
    },
] as const;

export default function ApiKeysPage() {
    const { profile, updateApiKey } = useUserProfile();

    return (
        <div>
            <h2 className="mb-3 text-2xl font-medium font-serif text-gray-900">
                API Keys
            </h2>
            <p className="text-sm text-gray-500 mb-4">
                You must provide your own API keys for the app to work or add
                your API keys into the .env file if you are running your own
                instance of Mike. All API keys are encrypted in storage.
            </p>
            <AccountSection>
                {MODEL_API_KEY_FIELDS.map((field, index) => (
                    <div key={field.provider}>
                        <ApiKeyField
                            label={field.label}
                            description={
                                "description" in field
                                    ? field.description
                                    : undefined
                            }
                            placeholder={field.placeholder}
                            hasSavedKey={
                                !!profile?.apiKeys[field.provider].configured
                            }
                            isServerConfigured={
                                profile?.apiKeys[field.provider].source ===
                                "env"
                            }
                            onSave={(value) =>
                                updateApiKey(
                                    field.provider,
                                    value.trim() || null,
                                )
                            }
                            onRemove={() => updateApiKey(field.provider, null)}
                        />
                        {index < MODEL_API_KEY_FIELDS.length - 1 && (
                            <div className="mx-4 h-px bg-gray-200" />
                        )}
                    </div>
                ))}
            </AccountSection>

            <AccountSection className="mt-8">
                {OTHER_API_KEY_FIELDS.map((field) => (
                    <ApiKeyField
                        key={field.provider}
                        label={field.label}
                        description={field.description}
                        placeholder={field.placeholder}
                        hasSavedKey={
                            !!profile?.apiKeys[field.provider].configured
                        }
                        isServerConfigured={
                            profile?.apiKeys[field.provider].source === "env"
                        }
                        onSave={(value) =>
                            updateApiKey(field.provider, value.trim() || null)
                        }
                        onRemove={() => updateApiKey(field.provider, null)}
                    />
                ))}
            </AccountSection>

            <PatsSection />
        </div>
    );
}

/**
 * C007 — personal access tokens for the Mike MCP server (/mcp-server).
 * Tokens are shown once at creation; only hashes are stored.
 */
function PatsSection() {
    const [tokens, setTokens] = useState<Pat[]>([]);
    const [name, setName] = useState("");
    const [creating, setCreating] = useState(false);
    const [newToken, setNewToken] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const refresh = useCallback(async () => {
        try {
            const { tokens } = await listPats();
            setTokens(tokens.filter((t) => !t.revoked_at));
        } catch {
            /* transient */
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const create = async () => {
        if (creating) return;
        setCreating(true);
        try {
            const { token } = await createPat(name.trim() || "MCP token");
            setNewToken(token);
            setName("");
            await refresh();
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="mt-8">
            <h3 className="mb-1 flex items-center gap-2 text-lg font-medium font-serif text-gray-900">
                <KeyRound className="h-4 w-4" /> MCP access tokens
            </h3>
            <p className="mb-3 text-sm text-gray-500">
                Personal access tokens let external agent hosts (Claude, Cowork,
                Copilot Studio) call Mike&apos;s legal tools via the MCP
                endpoint <code className="text-xs">/mcp-server</code>. Tokens
                are shown once — copy them immediately.
            </p>
            <AccountSection>
                <div className="px-4 py-4">
                    {newToken && (
                        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                            <p className="mb-1 text-xs font-medium text-amber-800">
                                Copy this token now — it will not be shown
                                again:
                            </p>
                            <div className="flex items-center gap-2">
                                <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 text-xs">
                                    {newToken}
                                </code>
                                <button
                                    onClick={() => {
                                        void navigator.clipboard.writeText(
                                            newToken,
                                        );
                                        setCopied(true);
                                        setTimeout(
                                            () => setCopied(false),
                                            1500,
                                        );
                                    }}
                                    className="rounded border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50"
                                    title="Copy token"
                                >
                                    <Copy className="h-3.5 w-3.5" />
                                </button>
                                {copied && (
                                    <span className="text-xs text-green-600">
                                        Copied
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                    <ul className="mb-3 space-y-1.5">
                        {tokens.map((t) => (
                            <li
                                key={t.id}
                                className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            >
                                <div>
                                    <p className="text-gray-900">{t.name}</p>
                                    <p className="text-[11px] text-gray-400">
                                        Created{" "}
                                        {new Date(
                                            t.created_at,
                                        ).toLocaleDateString()}
                                        {t.last_used_at
                                            ? ` · last used ${new Date(t.last_used_at).toLocaleDateString()}`
                                            : " · never used"}
                                    </p>
                                </div>
                                <button
                                    onClick={() =>
                                        void revokePat(t.id).then(refresh)
                                    }
                                    className="text-gray-300 hover:text-red-600"
                                    title="Revoke token"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </li>
                        ))}
                        {tokens.length === 0 && (
                            <li className="text-sm text-gray-400">
                                No active tokens.
                            </li>
                        )}
                    </ul>
                    <div className="flex items-center gap-2">
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Token name, e.g. 'Claude Cowork'"
                            className="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                        />
                        <button
                            onClick={() => void create()}
                            disabled={creating}
                            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                        >
                            {creating ? "Creating…" : "Create token"}
                        </button>
                    </div>
                </div>
            </AccountSection>
        </div>
    );
}

function ApiKeyField({
    label,
    description,
    placeholder,
    hasSavedKey,
    isServerConfigured,
    onSave,
    onRemove,
}: {
    label: string;
    description?: string;
    placeholder: string;
    hasSavedKey: boolean;
    isServerConfigured: boolean;
    onSave: (value: string) => Promise<boolean>;
    onRemove: () => Promise<boolean>;
}) {
    const [value, setValue] = useState("");
    const [reveal, setReveal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [pendingMfaAction, setPendingMfaAction] = useState<
        "save" | "remove" | null
    >(null);

    useEffect(() => {
        setValue("");
    }, [hasSavedKey]);

    const dirty = value.trim().length > 0;

    const handleSave = async () => {
        setIsSaving(true);
        try {
            if (await needsMfaVerification()) {
                setPendingMfaAction("save");
                return;
            }
            const ok = await onSave(value);
            if (ok) {
                setValue("");
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
            } else {
                alert(`Failed to save ${label}.`);
            }
        } catch (error) {
            if (isMfaRequiredError(error)) {
                setPendingMfaAction("save");
            } else {
                alert(`Failed to save ${label}.`);
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemove = async () => {
        setIsSaving(true);
        try {
            if (await needsMfaVerification()) {
                setPendingMfaAction("remove");
                return;
            }
            const ok = await onRemove();
            if (!ok) alert(`Failed to remove ${label}.`);
        } catch (error) {
            if (isMfaRequiredError(error)) {
                setPendingMfaAction("remove");
            } else {
                alert(`Failed to remove ${label}.`);
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleMfaVerified = async () => {
        const action = pendingMfaAction;
        setPendingMfaAction(null);
        if (action === "save") {
            await handleSave();
        } else if (action === "remove") {
            await handleRemove();
        }
    };

    return (
        <>
            <div className="px-4 py-5">
                <label className="text-sm font-medium text-gray-700 block mb-2">
                    {label}
                </label>
                {description && (
                    <p className="text-sm text-gray-500 mb-3">{description}</p>
                )}
                <div className="space-y-2">
                    <div className="relative flex-1">
                        <Input
                            type={reveal ? "text" : "password"}
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder={
                                isServerConfigured
                                    ? "Server .env key configured"
                                    : hasSavedKey
                                      ? "Saved key hidden"
                                      : placeholder
                            }
                            className={`pr-10 ${accountGlassInputClassName}`}
                            autoComplete="off"
                            spellCheck={false}
                            disabled={isServerConfigured}
                        />
                        {dirty && (
                            <button
                                type="button"
                                onClick={() => setReveal((r) => !r)}
                                disabled={isServerConfigured}
                                className={`absolute inset-y-1 right-1.5 flex items-center ${accountGlassIconButtonClassName}`}
                                aria-label={reveal ? "Hide key" : "Show key"}
                            >
                                {reveal ? (
                                    <EyeOff className="h-4 w-4" />
                                ) : (
                                    <Eye className="h-4 w-4" />
                                )}
                            </button>
                        )}
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={
                                isServerConfigured ||
                                isSaving ||
                                !dirty ||
                                saved
                            }
                            className="text-xs font-medium text-gray-700 transition-colors hover:text-gray-950 disabled:cursor-not-allowed disabled:text-gray-400"
                        >
                            {isSaving ? (
                                "Saving..."
                            ) : saved ? (
                                "Saved"
                            ) : (
                                "Save"
                            )}
                        </button>
                        {hasSavedKey && !isServerConfigured && (
                            <button
                                type="button"
                                onClick={handleRemove}
                                disabled={isSaving}
                                className="text-xs font-medium text-red-600 transition-colors hover:text-red-700 disabled:cursor-not-allowed disabled:text-red-300"
                            >
                                Remove
                            </button>
                        )}
                    </div>
                </div>
            </div>
            <MfaVerificationPopup
                open={!!pendingMfaAction}
                onCancel={() => setPendingMfaAction(null)}
                onVerified={() => void handleMfaVerified()}
            />
        </>
    );
}
