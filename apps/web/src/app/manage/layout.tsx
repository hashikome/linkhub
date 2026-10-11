import type { ReactNode } from "react";
import { OperatorNav } from "../../components/operator-ui";

export default function ManageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="manage-workspace">
      <OperatorNav />
      <div className="manage-content">{children}</div>
    </div>
  );
}
