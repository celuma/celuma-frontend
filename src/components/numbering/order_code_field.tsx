import { useEffect, useState } from "react";
import FloatingCaptionInput from "../ui/floating_caption_input";
import { previewNumbering } from "../../services/numbering_service";

interface Props {
    /** Study type chosen in the form; the suggestion follows it. */
    studyTypeId?: string;
    branchId?: string;
}

/**
 * «Código de la orden»: always disabled (hotfix 1.4.3). It shows the code the current numbering would give the
 * order, or stays empty when there is no suggestion. The order code is never typed: the definitive one is
 * assigned on registration and may differ.
 *
 * The suggestion comes from `POST /numbering/preview`, which reads only: it reserves nothing and consumes no
 * number. A late answer for a previous study type is discarded.
 */
export default function OrderCodeField({ studyTypeId, branchId }: Props) {
    const [suggestion, setSuggestion] = useState<string>("");

    useEffect(() => {
        setSuggestion("");
        if (!studyTypeId) return;
        let alive = true;
        previewNumbering({ entity_kind: "order", scope_id: studyTypeId, branch_id: branchId || undefined })
            .then((p) => {
                if (alive) setSuggestion(p.valid ? (p.estimate?.code ?? "") : "");
            })
            .catch(() => undefined);
        return () => {
            alive = false;
        };
    }, [studyTypeId, branchId]);

    return (
        <FloatingCaptionInput
            label="Código de la orden"
            value={suggestion}
            disabled
            readOnly
            data-testid="order-code"
        />
    );
}
