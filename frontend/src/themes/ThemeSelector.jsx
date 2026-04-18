import { useTheme } from './ThemeContext'
import { useState } from 'react'

const ThemeSelector = () => {
  const { 
    themes, 
    currentThemeId, 
    changeTheme,
    currentTheme 
  } = useTheme()
  
  const [justChanged, setJustChanged] = 
    useState(null)

  const handleSelect = (themeId) => {
    changeTheme(themeId)
    setJustChanged(themeId)
    setTimeout(() => setJustChanged(null), 1500)
  }

  return (
    <div className="w-full">

      {/* Section Header */}
      <div className="mb-6">
        <h3 className="text-lg font-black"
            style={{ color: 'var(--text-primary)' }}>
          🎨 App Theme
        </h3>
        <p className="text-sm mt-1"
           style={{ color: 'var(--text-secondary)' }}>
          Choose your preferred look. 
          Changes apply instantly.
        </p>
      </div>

      {/* Current Theme Preview Strip */}
      <div className="rounded-2xl p-4 mb-6 border"
           style={{ 
             background: 'var(--bg-card)',
             borderColor: 'var(--border)'
           }}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">
            {currentTheme.emoji}
          </span>
          <div>
            <p className="font-bold"
               style={{ color: 'var(--text-primary)' }}>
              {currentTheme.name}
            </p>
            <p className="text-sm"
               style={{ color: 'var(--text-secondary)' }}>
              {currentTheme.description}
            </p>
          </div>
          <div className="ml-auto flex gap-1.5">
            {/* Color preview dots */}
            {[
              currentTheme.colors['--accent'],
              currentTheme.colors['--bg-secondary'],
              currentTheme.colors['--text-primary'],
              currentTheme.colors['--success'],
            ].map((color, i) => (
              <div
                key={i}
                className="w-4 h-4 rounded-full 
                           border border-white/20"
                style={{ background: color }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Theme Grid — 2 columns */}
      <div className="grid grid-cols-2 gap-3">
        {themes.map(theme => {
          const isActive = 
            theme.id === currentThemeId
          const isJustChanged = 
            justChanged === theme.id

          return (
            <button
              key={theme.id}
              onClick={() => handleSelect(theme.id)}
              className="relative rounded-2xl p-4 
                         text-left border-2 
                         transition-all duration-200
                         active:scale-95"
              style={{
                background: theme.colors['--bg-secondary'],
                borderColor: isActive 
                  ? theme.colors['--accent']
                  : theme.colors['--border'],
                boxShadow: isActive
                  ? `0 0 20px ${theme.colors['--accent']}40`
                  : 'none',
              }}
            >
              {/* Active checkmark */}
              {isActive && (
                <div 
                  className="absolute top-2 right-2 
                             w-5 h-5 rounded-full 
                             flex items-center 
                             justify-center
                             text-xs font-black"
                  style={{
                    background: theme.colors['--accent'],
                    color: theme.colors['--accent-text'],
                  }}
                >
                  ✓
                </div>
              )}

              {/* Just changed flash */}
              {isJustChanged && (
                <div 
                  className="absolute inset-0 
                             rounded-2xl 
                             flex items-center 
                             justify-center
                             text-lg font-black
                             animate-ping opacity-0"
                  style={{
                    background: `${theme.colors['--accent']}20`,
                  }}
                />
              )}

              {/* Mini preview */}
              <div className="flex gap-1 mb-3">
                {/* Fake sidebar */}
                <div 
                  className="w-2 h-10 rounded-sm"
                  style={{ 
                    background: theme.colors['--sidebar-bg'] 
                  }}
                />
                {/* Fake content */}
                <div className="flex-1 space-y-1">
                  <div 
                    className="h-2 rounded-sm w-full"
                    style={{ 
                      background: theme.colors['--bg-card'] 
                    }}
                  />
                  <div 
                    className="h-3 rounded-sm w-3/4"
                    style={{ 
                      background: theme.colors['--accent'],
                      opacity: 0.7
                    }}
                  />
                  <div 
                    className="h-2 rounded-sm w-1/2"
                    style={{ 
                      background: theme.colors['--bg-card'] 
                    }}
                  />
                </div>
              </div>

              {/* Theme info */}
              <div className="flex items-center gap-2">
                <span className="text-base">
                  {theme.emoji}
                </span>
                <div>
                  <p 
                    className="font-bold text-xs leading-tight"
                    style={{ 
                      color: theme.colors['--text-primary'] 
                    }}
                  >
                    {theme.name}
                  </p>
                  <p 
                    className="text-xs leading-tight"
                    style={{ 
                      color: theme.colors['--text-secondary'] 
                    }}
                  >
                    {theme.description}
                  </p>
                </div>
              </div>

              {/* Accent color bar at bottom */}
              <div 
                className="absolute bottom-0 left-0 
                           right-0 h-1 rounded-b-2xl"
                style={{ 
                  background: theme.colors['--accent'] 
                }}
              />
            </button>
          )
        })}
      </div>

      {/* Apply confirmation */}
      {justChanged && (
        <div 
          className="mt-4 rounded-xl p-3 
                     text-center text-sm font-bold"
          style={{
            background: `${currentTheme.colors['--accent']}20`,
            color: currentTheme.colors['--accent'],
            border: `1px solid ${currentTheme.colors['--accent']}40`,
          }}
        >
          ✅ {currentTheme.name} theme applied!
        </div>
      )}
    </div>
  )
}

export default ThemeSelector
