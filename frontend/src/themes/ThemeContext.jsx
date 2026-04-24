import { createContext, useContext, useState, useEffect } from 'react'
import { themes, DEFAULT_THEME, getTheme } from './themes'

const ThemeContext = createContext()

export const ThemeProvider = ({ children }) => {
  const [currentThemeId, setCurrentThemeId] = useState(
    () => localStorage.getItem('msrm_theme') || DEFAULT_THEME
  )

  const applyTheme = (themeId) => {
    const theme = getTheme(themeId)
    const root = document.documentElement
    Object.entries(theme.colors).forEach(([prop, val]) => {
      root.style.setProperty(prop, val)
    })
    if (theme.isDark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }

  useEffect(() => {
    applyTheme(currentThemeId)
  }, [currentThemeId])

  const changeTheme = (themeId) => {
    setCurrentThemeId(themeId)
    localStorage.setItem('msrm_theme', themeId)
    applyTheme(themeId)
  }

  const toggleTheme = () => {
    const next = currentThemeId === 'light' ? 'dark' : 'light'
    changeTheme(next)
  }

  return (
    <ThemeContext.Provider value={{
      currentThemeId,
      currentTheme: getTheme(currentThemeId),
      themes,
      changeTheme,
      toggleTheme,
      isDark: getTheme(currentThemeId).isDark,
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}
