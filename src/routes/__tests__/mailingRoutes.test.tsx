import { describe, it, expect } from "vitest";
import { Children, isValidElement, type ReactElement } from "react";
import { publicRoutes } from "@/routes/publicRoutes";
import { organizationRoutes } from "@/routes/organizationRoutes";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { OrgDashboardProvider } from "@/contexts/OrgDashboardContext";

function flatten(node: ReactElement): ReactElement[] {
  const out: ReactElement[] = [];
  const walk = (n: unknown) => {
    Children.forEach(n as ReactElement, (child) => {
      if (!isValidElement(child)) return;
      out.push(child);
      const props = child.props as { children?: unknown };
      if (props?.children) walk(props.children);
    });
  };
  walk(node);
  return out;
}

const publicList = flatten(publicRoutes as ReactElement);
const orgList = flatten(organizationRoutes as ReactElement);

const findRoute = (list: ReactElement[], path: string) =>
  list.find((el) => (el.props as { path?: string }).path === path);

describe("mailing routes", () => {
  it("registers the public /mailing landing route", () => {
    const route = findRoute(publicList, "/mailing");
    expect(route).toBeTruthy();
    expect((route!.props as { element?: unknown }).element).toBeTruthy();
  });

  it("registers /mailing/app behind the organization guard", () => {
    const route = findRoute(orgList, "/mailing/app");
    expect(route).toBeTruthy();
    const element = (route!.props as { element?: ReactElement }).element!;
    expect(element.type).toBe(ProtectedRoute);
    expect((element.props as { requiredRole?: string }).requiredRole).toBe("organization");
  });

  it("wraps /mailing/app in OrgDashboardProvider so it reuses the /organization org context", () => {
    const route = findRoute(orgList, "/mailing/app")!;
    const element = (route.props as { element?: ReactElement }).element!;
    const inner = (element.props as { children?: ReactElement }).children!;
    expect(inner.type).toBe(OrgDashboardProvider);
  });

  it("does not expose /mailing/app as a public route", () => {
    expect(findRoute(publicList, "/mailing/app")).toBeUndefined();
  });
});
