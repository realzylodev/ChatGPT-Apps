/**
 * Todo Widget Entry Point
 * Main entry point for the Todo ChatGPT widget
 */

import { createRoot } from "react-dom/client";
import { TodoApp } from "./components/TodoApp";
import "./styles.css";

// Initialize the widget when DOM is ready
const container = document.getElementById("todo-root");
if (container) {
  const root = createRoot(container);
  root.render(<TodoApp />);
}

// Export for build system
export { TodoApp as App };
export default TodoApp;