import { Children, isValidElement, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { publicRoutes } from "@/routes/publicRoutes";
import { studentRoutes } from "@/routes/studentRoutes";

function flatten(node: ReactElement): ReactElement[] {
  const result: ReactElement[] = [];
  const walk = (value: unknown) => {
    Children.forEach(value as ReactElement, (child) => {
      if (!isValidElement(child)) return;
      result.push(child);
      const props = child.props as { children?: unknown };
      if (props.children) walk(props.children);
    });
  };
  walk(node);
  return result;
}

const reviewerPath = "/review/course/:courseId";

describe("course reviewer route", () => {
  it("is authenticated without assigning a global app role", () => {
    const route = flatten(studentRoutes as ReactElement)
      .find((element) => (element.props as { path?: string }).path === reviewerPath);

    expect(route).toBeTruthy();
    const element = (route!.props as { element: ReactElement }).element;
    expect(element.type).toBe(ProtectedRoute);
    expect((element.props as { requiredRole?: string }).requiredRole).toBeUndefined();
  });

  it("is absent from the public route tree", () => {
    const publicRoute = flatten(publicRoutes as ReactElement)
      .find((element) => (element.props as { path?: string }).path === reviewerPath);
    expect(publicRoute).toBeUndefined();
  });
});
