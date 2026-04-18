import { 
  createContext, 
  useContext, 
  useState, 
  useEffect 
} from 'react'
import { themes, DEFAULT_THEME, getTheme } 
  from './themes'

const ThemeContext = createContext()

export const ThemeProvider = ({ children }) => {
  
  // Load saved theme from localStorage
  const [currentThemeId, setCurrentThemeId] = 
    useState(() => {
      return localStorage.getItem('pos_theme') 
        || DEFAULT_THEME
    })

  // Apply theme CSS variables to :root
  const applyTheme = (themeId) => {
    const theme = getTheme(themeId)
    const root = document.documentElement
    
    Object.entries(theme.colors).forEach(
      ([property, value]) => {
        root.style.setProperty(property, value)
      }
    )
  }

  // Apply on mount + theme change
  useEffect(() => {
    applyTheme(currentThemeId)
  }, [currentThemeId])

  const changeTheme = (themeId) => {
    setCurrentThemeId(themeId)
    localStorage.setItem('pos_theme', themeId)
    applyTheme(themeId)
  }

  return (
    <ThemeContext.Provider value={{
      currentThemeId,
      currentTheme: getTheme(currentThemeId),
      themes,
      changeTheme,
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error(
      'useTheme must be used inside ThemeProvider'
    )
  }
  return context
}
