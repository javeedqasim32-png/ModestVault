import * as React from "react"

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'success'
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
    ({ className, variant = 'default', ...props }, ref) => {
        const variants = {
            default: "bg-primary text-primary-foreground",
            secondary: "bg-secondary text-secondary-foreground",
            outline: "border border-border text-foreground bg-transparent",
            destructive: "bg-destructive text-destructive-foreground",
            success: "bg-green-50 text-green-800 border border-green-200",
        }

        return (
            <span
                ref={ref}
                className={`inline-flex items-center px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${variants[variant]} ${className}`}
                {...props}
            />
        )
    }
)
Badge.displayName = "Badge"
