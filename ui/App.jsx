import { useEffect, useRef, useState } from "react";
import "./App.css";

//const domain = "wss://corymblike-positivistically-nevada.ngrok-free.dev"
const domain = "ws://0.0.0.0:8000"

function create_ws(route) {
    var ws = new WebSocket(domain + "/" + route);
    return ws
}

function pathPointsSvg(paths, stroke, stroke_opacity) {
  return paths.map((path, i) => (
      <path
        key={i}
        d={`M ${path.map(p => `${p.x} ${p.y}`).join(" L ")}`}
        stroke={stroke}
        strokeOpacity={stroke_opacity}
        strokeWidth={5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
  ))
}

// TODO: don't need to render every local path, just the ones that haven't been
// synced.
// TODO: separate rerender triggers for previous, current and next frame
function Drawing({frames, rerender_trigger}) {
  const local_paths = frames.getDisplayedPaths(0);
  const synced_paths = frames.getDisplayedPaths(1);
  return (
      <>
      {
        pathPointsSvg(local_paths[0], "red", "0.05")
      }
      {
        pathPointsSvg(synced_paths[0], "red", "0.1")
      }
      {
        pathPointsSvg(local_paths[1], "black", "0.3")

      }
      {
        pathPointsSvg(synced_paths[1], "black", "1")
      }
      {
        pathPointsSvg(local_paths[2], "blue", "0.05")
      }
      {
        pathPointsSvg(synced_paths[2], "blue", "0.1")
      }
      {
        <text x="780" y="590">{frames.display_index}</text>
      }
      </>
  );
}

function Animation({frames, effective_length}) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setFrame(frame => (frame + 1) % effective_length);
    }, 1000 / 12);

    return () => clearInterval(id);
  })

  let local_paths = frames.getPoints(frame);
  let synced_paths = frames.getPoints(frame);

  return (
    <>
      {
        pathPointsSvg(local_paths, "black", "0.3")
      }
      {
        pathPointsSvg(synced_paths, "black", "1") 
      }
      {
        <text x="780" y="590">{frame}</text>
      }
    </>
  )
}

function DrawMouse({mouse_position, rerender_trigger}) {
  return (
      <>      
      {
        mouse_position && (<>
        <circle cx={`${mouse_position.x}`} cy={`${mouse_position.y}`} r="5" stroke="gray" fill="none" /> 
        <circle cx={`${mouse_position.x}`} cy={`${mouse_position.y}`} r="1" stroke="black" /></>)
      }
      </>)
}

class DrawInstruction {
  // TODO: use subclasses to express instructions of different types. For now,
  // if point is null we're signaling mouse up, otherwise we're drawing a new
  // point.
  constructor(name, frame_index, point) {
    this.name = name;
    this.frame_index = frame_index;
    this.point = point;    
  }

  // TODO: json
  toString() {
    if (this.point !== null) {
      return this.name + " point " + this.frame_index + " " + this.point.x + " " + this.point.y;
    } else {
      return this.name + " endpath " + this.frame_index;
    }
  }
}

function instructionOfString(str) {
  const parts = str.split(" ");
  const name = parts[0];
  // TODO: parse into int, for now string works
  const frame_index = parseInt(parts[2]);

  let point = null;
  if (parts[1] == "point") {
    point = {x:parseFloat(parts[3]), y:parseFloat(parts[4])};
  } else {
    if (parts[1] != "endpath") {
      console.log("unexpected instruction '" + str + "'");
    }
  }

  return new DrawInstruction(name, frame_index, point);
}

class Paths {
  constructor() {
    this.finishedPaths = [];
    this.openPaths = new Map();
  }

  getPathPoints() {
    return this.finishedPaths.concat([...this.openPaths.values()]);
  }

  // returns true, should always cause rerender
  point(name, point) {
    if (!this.openPaths.has(name)) {
      this.openPaths.set(name, [point]);
    } else {
      this.openPaths.get(name).push(point);
    }
    return true;
  }

  endpath(name) {
    if (this.openPaths.has(name)) {
      this.finishedPaths.push(this.openPaths.get(name));
      this.openPaths.delete(name);
      return true;
    }
    console.log("unexpected end path with no active path? for " + name);
    return false;
  }
}

class Frame {
  constructor() {
    this.localPaths = new Paths();
    this.syncedPaths = new Paths();
  }

  // TODO: use enum
  getPaths(local_or_synced) {
    if (local_or_synced == 0) {
      return this.localPaths;
    }
    return this.syncedPaths;
  }

  point(name, point, local_or_synced) {
    const paths = this.getPaths(local_or_synced);
    return paths.point(name, point);
  }

  endpath(name, local_or_synced) {
    const paths = this.getPaths(local_or_synced);
    return paths.endpath(name, local_or_synced);
  }
}

class Frames {
  constructor() {
    this.frames = [new Frame()];
    this.display_index = 0;
  }

  getFrame(frame_index) {
    while (frame_index >= this.frames.length) {
      this.frames.push(new Frame());
    }
    return this.frames[frame_index];
  }

  getPoints(frame_index, local_or_synced) {
    const frame = this.getFrame(frame_index);
    const paths = frame.getPaths(local_or_synced);
    return paths.getPathPoints();
  }

  effectiveLength() {
    let effective_length = this.frames.length;
    while (effective_length > 0) {
      const local_points = this.getPoints(effective_length - 1, 0);
      const synced_points = this.getPoints(effective_length - 1, 1);
      if (local_points.length != 0 || synced_points != 0) {
        break;
      }
      effective_length -= 1;
    }
    return effective_length;
  }

  getDisplayedPaths(local_or_synced) {
    const displayed_paths = [];
    for (let frame_index = this.display_index - 1; frame_index <= this.display_index + 1; frame_index += 1) {
      if (frame_index < 0) {
        displayed_paths.push([]);
      } else {
        displayed_paths.push(this.getPoints(frame_index, local_or_synced));
      }
    }
    return displayed_paths;
  }

  pageRight() {
    this.display_index += 1;
  }

  pageLeft() {
    if (this.display_index > 0) {
      this.display_index -= 1;
    }
  }

  frameIndexWithinDisplayBounds(frame_index) {
    return frame_index >= this.display_index - 1 && frame_index <= this.display_index + 1
  }

  _point(name, point, frame_index, local_or_synced) {
    const frame = this.getFrame(frame_index);
    return frame.point(name, point, local_or_synced) && this.frameIndexWithinDisplayBounds(frame_index);
  }

  _endpath(name, frame_index, local_or_synced) {
    const frame = this.getFrame(frame_index);
    return frame.endpath(name, local_or_synced) && this.frameIndexWithinDisplayBounds(frame_index);
  }

  executeInstruction(draw_instruction, local_or_synced) {
    if (draw_instruction.point == null) {
      this._endpath(draw_instruction.name, draw_instruction.frame_index, local_or_synced);
    } else {
      this._point(draw_instruction.name, 
        draw_instruction.point, 
        draw_instruction.frame_index, 
        local_or_synced);
    }
  }
}

class Mouse {
  constructor() {
    this.positions = new Map();
  }

  getPosition(name) {
    if (!this.positions.has(name)) {
      this.positions.set(name, null);
    }
    return this.positions.get(name);
  }

  setPosition(name, position) {
    this.positions.set(name, position);
  }
}

export default function App() {
  const eventSocket = useRef(null);

  const localPathsIdx = 0;
  const syncedPathsIdx = 1;

  const frames = useRef(new Frames());

  const mouseBox = useRef(null);
  const mouse_positions = useRef(new Mouse());

  const [rerenderDrawingTrigger, setRerenderDrawingTrigger] = useState(0);
  const [rerenderMouseTrigger, setRerenderMouseTrigger] = useState(0);

  const pointerLocked = useRef(false);


  const [animationRunning, setAnimationRunning] = useState(false);


  function playPause() {
    setAnimationRunning(animationRunning => !animationRunning);
  }

  const getPoint = (e) => {
    const rect = e.target.getBoundingClientRect();
    return (e.clientX - rect.left).toString() + " " + (e.clientY - rect.top).toString();
  };

  function triggerDrawingRerender() {
    setRerenderDrawingTrigger(rerenderDrawingTrigger => rerenderDrawingTrigger + 1);
  }

  function triggerMouseRerender() {
    setRerenderMouseTrigger(rerenderMouseTrigger => rerenderMouseTrigger + 1);
  }

  function clickRight() {
    frames.current.pageRight();
    triggerDrawingRerender();
  }

  function clickLeft() {
    frames.current.pageLeft();
    triggerDrawingRerender();
  }

  function sendInstruction(draw_instruction) {
    if (eventSocket.current?.readyState == WebSocket.OPEN) {
      eventSocket.current?.send(draw_instruction.toString());
    }
  }
  
  const onMouseDown = async () => {
    if (!document.pointerLockElement) {
      if (mouseBox.current) {
        await mouseBox.current.requestPointerLock({
          unadjustedMovement: true,
        });
      }
    }

    const name = "local";
    const mouse_position = mouse_positions.current.getPosition(name);
    if (mouse_position !== null) {
      const draw_instruction = new DrawInstruction(name, frames.current.display_index, mouse_position);
      if (frames.current.executeInstruction(draw_instruction, localPathsIdx)) {
        triggerDrawingRerender();
      }
      sendInstruction(draw_instruction);
    }
  };

  const onMouseMove = (e) => {
    let point = null;
    const name = "local";
    if (pointerLocked.current) {
      if (mouse_positions.current) {
        const oldPosition = mouse_positions.current.getPosition(name);
        if (oldPosition) {
          point = (oldPosition.x + (e.movementX / 3.)) + " " + (oldPosition.y + (e.movementY / 3.));
        }
      }
    }
    if (! point) {
      point = getPoint(e);
    }

    mouse_positions.current.setPosition(name, point);
    triggerMouseRerender();

    const draw_instruction = new DrawInstruction(name, frames.current.display_index, point);
    if (frames.current.executeInstruction(draw_instruction, localPathsIdx)) {
      triggerDrawingRerender();
    }
    sendInstruction(draw_instruction);
  };

  const onMouseUp = () => {
    document.exitPointerLock();

    const draw_instruction = new DrawInstruction("local", frames.current.display_index, null);
    if (frames.current.executeInstruction(draw_instruction, local_or_synced)) {
      triggerDrawingRerender();
    }
    sendInstruction(draw_instruction);
  };

  
  const onKeyDown = async (e) => {
    if (e.key == "s") {
      await onMouseDown();
    }
  }

  const onKeyUp = (e) => {
    if (e.key == "s") {
      onMouseUp();
    }
  }
  
  useEffect(() => {
    // set up web sockets
    const socket = create_ws("draw-ws");
    eventSocket.current = socket;
    
    socket.onmessage = function(event) {
      const draw_instruction = instructionOfString(event.data);
      if (frames.current.executeInstruction(draw_instruction, syncedPathsIdx)) {
        triggerDrawingRerender();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    document.addEventListener("pointerlockchange", () => {
      if (mouseBox.current && document.pointerLockElement == mouseBox.current) {
        pointerLocked.current = true;
      } else {
        pointerLocked.current = false;
      }
    }, false);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    }
  }, []);

  // TODO: add file saving like this
  /*
  const [fileHandle, setFileHandle] = useState(null);
  async function chooseSaveLocation() {

    const handle = await window.showSaveFilePicker({
      suggestedName: "drawing.svg",
      types: [
        {
          description: "SVG",
          accept: {"image/svg+xml": [".svg"]}
        }
      ]
    });

    setFileHandle(handle);
  }


  // add this to the returned html
      <button onClick={chooseSaveLocation}>
        Save as...
      </button>
    */


  return (
    // TODO: combine the overlayed svgs. doing it naively messes up the mouse
    // location though
    <div className="App">
      {
        !animationRunning &&
        <>
         <svg width={800} height={600} style={{ border: "1px solid black" }} className="Drawing">
          <Drawing frames={frames.current} rerender_trigger={rerenderDrawingTrigger} />
          <DrawMouse mouse_position={mouse_positions.current.getPosition("local")} rerender_trigger={rerenderMouseTrigger} />
         </svg>
         <svg
           width={800}
           height={600}
           style={{ position: "absolute", top: 0, left: 0 }}
           onMouseDown={onMouseDown}
           onMouseMove={onMouseMove}
           onMouseUp={onMouseUp}
           className="Drawing"
           ref={mouseBox}>
         </svg>
         <button onClick={clickLeft}> Left </button>
         <button onClick={clickRight}> Right </button>
        </>
      }
      {
        animationRunning &&
        <>
         <svg width={800} height={600} style={{ border: "1px solid black" }} className="Drawing">
          <Animation frames={frames.current} effective_length={frames.current.effectiveLength()} />
         </svg>
        </>
      }
      <button onClick={playPause}> Play/Pause </button>
    </div>
  );
}