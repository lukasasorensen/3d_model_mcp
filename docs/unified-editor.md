# Unified 3D editor

The [THE-75](https://linear.app/theoryfoundry/issue/THE-75/unify-object-editing-in-the-main-3d-view) and [THE-76](https://linear.app/theoryfoundry/issue/THE-76/move-parameter-controls-into-a-floating-right-hand-panel) mockup uses Canva as a reference for the selection toolbar and floating Parameters panel.

- Click or tap a visible object in the main 3D viewport, or use the Selected object list. The toolbar exposes Move, Rotate, Scale, exact axis inputs and Fit object. Drag a colored handle to edit, or drag the background to orbit. Move uses world axes, while Rotate and Scale use local axes. Object transforms pivot at each object's source origin.
- With focus in the viewport or on an editing button, use ⌘/Ctrl+C to copy an object, ⌘/Ctrl+V to paste, and ⌘/Ctrl+Z to undo a working model edit. ⌘/Ctrl+Shift+Z or Ctrl+Y redo it. Text inputs and other workspace areas keep their normal shortcuts. Copy and paste stay within the project. Save new revision validates and saves the complete working model.
- Toggle Parameters independently of selection. The panel floats to the right in wider editors and below the canvas in narrower editors. Escape or Close returns focus to the toggle. Closing the panel retains the draft. Parameter changes schedule a preview automatically.
- The validated composition remains visible while object meshes load. Dragging shows the separately rendered operands in the same scene. The exact composition rebuilds when the gesture settles. When direct preview hits its geometry budget or cannot render an operand, the exact fields still work against the saved revision. Downloads use the saved composition.

[Working model and revision saves](working-model.md) covers draft recovery, rendering and conflicts.
