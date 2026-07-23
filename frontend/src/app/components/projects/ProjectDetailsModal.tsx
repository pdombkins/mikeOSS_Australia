"use client";

import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { Modal } from "@/app/components/modals/Modal";
import { ModalFieldLabel } from "@/app/components/modals/ModalFieldLabel";
import { ModalTextInput } from "@/app/components/modals/ModalTextInput";
import type { Project } from "@/app/components/shared/types";
import { ProjectPracticeField } from "./ProjectPracticeField";
import { getProjectUsage } from "@/app/lib/mikeApi";

interface ProjectDetailsModalProps {
    open: boolean;
    project: Project | null;
    canEdit: boolean;
    onClose: () => void;
    onSave: (values: { name: string; cmNumber: string; practice: string }) => Promise<void>;
    onShareProject?: () => void;
}

export function ProjectDetailsModal({
    open,
    project,
    canEdit,
    onClose,
    onSave,
    onShareProject,
}: ProjectDetailsModalProps) {
    const [nameDraft, setNameDraft] = useState("");
    const [cmDraft, setCmDraft] = useState("");
    const [practiceDraft, setPracticeDraft] = useState("");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // C077 — matter spend (AUD, from query_costs.project_id).
    const [usage, setUsage] = useState<{
        total_aud: number;
        this_month_aud: number;
    } | null>(null);

    useEffect(() => {
        if (!open || !project) return;
        setNameDraft(project.name);
        setCmDraft(project.cm_number ?? "");
        setPracticeDraft(project.practice ?? "");
        setSaved(false);
        setError(null);
        setUsage(null);
        void getProjectUsage(project.id)
            .then(setUsage)
            .catch(() => {
                /* best-effort */
            });
    }, [open, project]);

    const trimmedName = nameDraft.trim();
    const trimmedCm = cmDraft.trim();
    const trimmedPractice = practiceDraft.trim();
    const hasChanges = useMemo(() => {
        if (!project) return false;
        return (
            trimmedName !== project.name ||
            trimmedCm !== (project.cm_number ?? "") ||
            trimmedPractice !== (project.practice ?? "")
        );
    }, [project, trimmedCm, trimmedName, trimmedPractice]);

    if (!project) return null;

    async function handleSave() {
        if (!canEdit || saving || !hasChanges || !trimmedName) return;
        setSaving(true);
        setSaved(false);
        setError(null);
        try {
            await onSave({
                name: trimmedName,
                cmNumber: trimmedCm,
                practice:
                    trimmedPractice && trimmedPractice !== "Other"
                        ? trimmedPractice
                        : "",
            });
            setSaved(true);
        } catch {
            setError("Could not update project details.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            breadcrumbs={["Projects", project.name, "Details"]}
            secondaryAction={
                onShareProject
                    ? {
                          label: "Share Project",
                          icon: <Users className="h-4 w-4" />,
                          onClick: onShareProject,
                      }
                    : undefined
            }
            footerStatus={
                error ? (
                    <span className="text-sm text-red-600">{error}</span>
                ) : saved ? (
                    <span className="text-sm text-gray-400">Updated</span>
                ) : null
            }
            primaryAction={
                canEdit
                    ? {
                          label: saving ? "Updating..." : "Update",
                          onClick: () => void handleSave(),
                          disabled: saving || !hasChanges || !trimmedName,
                      }
                    : undefined
            }
            cancelAction={canEdit ? undefined : false}
        >
            <div className="flex min-h-0 flex-1 flex-col gap-6 py-1">
                <div>
                    <ModalFieldLabel htmlFor="project-details-name">
                        Project name
                    </ModalFieldLabel>
                    <ModalTextInput
                        id="project-details-name"
                        value={nameDraft}
                        onChange={(e) => {
                            setNameDraft(e.target.value);
                            setSaved(false);
                            setError(null);
                        }}
                        disabled={!canEdit || saving}
                        placeholder="Add project name"
                        variant="minimal"
                    />
                </div>

                <div>
                    <ModalFieldLabel htmlFor="project-details-cm">
                        CM number
                    </ModalFieldLabel>
                    <ModalTextInput
                        id="project-details-cm"
                        value={cmDraft}
                        onChange={(e) => {
                            setCmDraft(e.target.value);
                            setSaved(false);
                            setError(null);
                        }}
                        disabled={!canEdit || saving}
                        placeholder="Add a CM number..."
                        variant="minimal"
                        className="text-xl text-gray-600"
                    />
                </div>

                <div>
                    <ModalFieldLabel htmlFor="project-details-practice">
                        Practice
                    </ModalFieldLabel>
                    <ProjectPracticeField
                        id="project-details-practice"
                        value={practiceDraft}
                        onChange={(value) => {
                            setPracticeDraft(value);
                            setSaved(false);
                            setError(null);
                        }}
                        disabled={!canEdit || saving}
                    />
                </div>

                {usage && (
                    <div>
                        <ModalFieldLabel htmlFor="project-details-usage">
                            AI spend
                        </ModalFieldLabel>
                        <p
                            id="project-details-usage"
                            className="text-sm text-gray-600"
                        >
                            A${usage.this_month_aud.toFixed(2)} this month · A$
                            {usage.total_aud.toFixed(2)} all time
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400">
                            Assistant, tabular review, and agent usage recorded
                            against this matter.
                        </p>
                    </div>
                )}

            </div>
        </Modal>
    );
}
