import { requirePageUser } from "@/lib/auth";
import { WorkspaceShellFrame } from "../_components/workspace-shell-frame";

export default async function AdminWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requirePageUser();

  return (
    <WorkspaceShellFrame userEmail={user.email ?? "admin"}>
      {children}
    </WorkspaceShellFrame>
  );
}
