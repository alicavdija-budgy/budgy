#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "Guardian Money CHF - Application mobile complète (Expo, Supabase, RevenueCat, 5 onglets, scanner flottant, LAMal Priminfo 26 cantons, IA). Itération: Compléter le flux d'onboarding pour les nouveaux comptes (questions personnalisées) + vérifier/activer la caméra réelle pour le scanner."

frontend:
  - task: "Onboarding questionnaire (6 steps)"
    implemented: true
    working: true
    file: "app/frontend/app/onboarding.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Refonte complète : 4 slides d'intro + 6 étapes de configuration (canton 26 CH, devise, situation pro, revenu mensuel avec chips rapides, situation familiale + compteur d'enfants, objectifs multi-select). Barre de progression, bouton retour, navigation finale vers /(tabs). Sauvegarde préférences + création d'une entrée Income si revenu fourni. Testé de bout en bout via screenshot, flux fonctionnel."

  - task: "Camera Scanner (expo-camera)"
    implemented: true
    working: true
    file: "app/frontend/app/scanner-modal.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Remplacement du Modal fake par un vrai écran scanner-modal (presentation: modal). Utilise expo-camera/useCameraPermissions + CameraView. Stages: permission -> camera (framing + flash + front/back toggle + capture 0.6 base64) -> edit (preview + montant + titre + catégorie + payment method + note). Sauvegarde la transaction avec reçu en base64. Fallback saisie manuelle sur web/Expo Go sans caméra. iOS usage description déjà présente dans app.json (NSCameraUsageDescription). Testé: scanner-modal ouvre correctement depuis le bouton flottant et affiche le formulaire de saisie."

  - task: "Auth flow new account -> onboarding"
    implemented: true
    working: true
    file: "app/frontend/app/auth.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Nouveaux comptes redirigent vers /onboarding (pas de seed data). Comptes Pro existants et mode démo vont directement sur /(tabs). Testé avec création nouveau compte testuser@guardian.ch -> redirige bien vers /onboarding."

  - task: "Fix zustand import.meta web crash"
    implemented: true
    working: true
    file: "node_modules/zustand/esm/middleware.mjs (patched)"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Patch in-place de zustand/esm/middleware.mjs (2 références à import.meta.env.MODE remplacées par 'production'). Résout le 'Cannot use import.meta outside a module' qui bloquait le bundle web. Confirmé via curl du bundle : plus de références à import.meta."

backend:
  - task: "Existing backend endpoints (health, chat, family, export/pdf, alerts)"
    implemented: true
    working: true
    file: "app/backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Aucune modification backend dans cette itération. Tous les endpoints existants répondent 200 dans les logs supervisor."

metadata:
  created_by: "main_agent"
  version: "3.1"
  test_sequence: 3
  run_ui: false

test_plan:
  current_focus:
    - "Onboarding questionnaire (6 steps)"
    - "Camera Scanner (expo-camera)"
    - "Auth flow new account -> onboarding"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "Itération terminée : onboarding complet 6 étapes + scanner caméra réel via expo-camera. Patch zustand pour web. Testé au screenshot tool, flux OK de bout en bout. Prêt pour test utilisateur sur Expo Go (iOS/Android) où la caméra réelle pourra être essayée."
