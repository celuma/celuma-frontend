import { Alert } from "antd";
import type { Blocker } from "../../services/order_management_service";

/** Plain-language reasons why a direct change is not available right now (the API re-checks everything). */
export default function BlockersNotice({ blockers, lead, testId }: { blockers: Blocker[]; lead: string; testId?: string }) {
    if (blockers.length === 0) return null;
    return (
        <Alert
            type="info" showIcon data-testid={testId}
            message={lead}
            description={<ul style={{ margin: 0, paddingLeft: 18 }}>{blockers.map((b) => <li key={`${b.code}-${b.report_id ?? ""}`}>{b.message}</li>)}</ul>}
        />
    );
}
