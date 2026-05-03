import type { ReactNode } from "react";

type ButtonGroupProps = {
  children: ReactNode;
  className?: string;
};

export function ButtonGroup({ children, className = "" }: ButtonGroupProps) {
  return <div className={`flex flex-wrap gap-2 ${className}`}>{children}</div>;
}

type ConsoleButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variantClasses: Record<ConsoleButtonVariant, string> = {
  primary: "bg-[var(--brand)] text-white hover:opacity-90",
  secondary: "border border-[var(--panel-border)] bg-white hover:bg-slate-50 text-slate-800",
  ghost: "border border-transparent text-slate-600 hover:bg-slate-100",
  danger: "border border-red-200 bg-red-50 text-red-800 hover:bg-red-100",
};

type ConsoleButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: ConsoleButtonVariant;
  className?: string;
};

export function ConsoleButton({ variant = "secondary", className = "", ...rest }: ConsoleButtonProps) {
  return (
    <button
      type={rest.type ?? "button"}
      className={`inline-flex cursor-pointer items-center justify-center rounded px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...rest}
    />
  );
}
