import * as React from "react"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
    size?: 'sm' | 'md' | 'lg' | 'icon'
    isLoading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', size = 'md', isLoading, children, ...props }, ref) => {
        const baseStyles = "inline-flex items-center justify-center font-medium uppercase tracking-wider transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none"

        const variants = {
            primary: "bg-primary text-primary-foreground hover:opacity-80",
            secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            outline: "border-2 border-primary bg-transparent text-primary hover:bg-primary hover:text-primary-foreground",
            ghost: "hover:bg-muted text-foreground",
            danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        }

        const sizes = {
            sm: "h-9 px-5 text-[11px]",
            md: "h-11 px-7 text-xs",
            lg: "h-13 px-10 text-sm",
            icon: "h-10 w-10",
        }

        return (
            <button
                ref={ref}
                className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
                disabled={isLoading}
                {...props}
            >
                {isLoading ? (
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : null}
                {children}
            </button>
        )
    }
)
Button.displayName = "Button"
