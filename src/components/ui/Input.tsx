import * as React from "react"

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> { }

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, ...props }, ref) => (
        <input
            type={type}
            ref={ref}
            className={`w-full border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground rounded-[16px] focus:outline-none focus:border-primary transition-colors ${className}`}
            {...props}
        />
    )
)
Input.displayName = "Input"

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
    required?: boolean;
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
    ({ className, required, children, ...props }, ref) => (
        <label
            ref={ref}
            className={`text-xs font-medium uppercase tracking-wider text-foreground ${className}`}
            {...props}
        >
            {children}
            {required ? <span className="ml-0.5 text-red-600" aria-hidden="true">*</span> : null}
        </label>
    )
)
Label.displayName = "Label"
