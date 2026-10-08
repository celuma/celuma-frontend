import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import AssigneesSection from "../../src/components/collaboration/AssigneesSection";
import { getLabUsers, type LabUser } from "../../src/services/collaboration_service";

function Harness() {
    const [users, setUsers] = useState<LabUser[]>([]);
    const [selected, setSelected] = useState(["user-002"]);
    const [error, setError] = useState("");
    useEffect(() => {
        getLabUsers().then(setUsers).catch((e: Error) => setError(e.message));
    }, []);
    return <div style={{ maxWidth: 360, padding: 20 }}>
        <div data-testid="loaded">{users.length}</div>
        {error && <div role="alert">{error}</div>}
        <AssigneesSection
            allUsers={users}
            assignees={users.filter(u => selected.includes(u.id))}
            onUpdate={async ids => { setSelected(ids); }}
            disabled={!users.length}
        />
        <output data-testid="selected">{[...selected].sort().join(",")}</output>
    </div>;
}

createRoot(document.getElementById("root")!).render(<Harness />);
