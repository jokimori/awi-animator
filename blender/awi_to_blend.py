"""AWI · arma un proyecto .blend (y opcionalmente un MP4) a partir del .glb animado del editor.

Uso:
  blender -b -P awi_to_blend.py -- animacion.glb salida.blend [salida.mp4]
O desde Blender > Scripting > Run Script: busca el primer .glb que haya al lado del script.
"""
import bpy, sys, os, glob, math

FPS = 30
BG = (0.905, 0.865, 0.83)  # crema (lineal aprox. de #f4eee8)


def args():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    here = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd()
    glb = a[0] if a else (sorted(glob.glob(os.path.join(here, "*.glb"))) or [None])[0]
    if not glb or not os.path.exists(glb):
        raise SystemExit("No encontré el .glb. Uso: blender -b -P awi_to_blend.py -- animacion.glb salida.blend [salida.mp4]")
    out = a[1] if len(a) > 1 else os.path.splitext(glb)[0] + ".blend"
    mp4 = a[2] if len(a) > 2 else None
    return os.path.abspath(glb), os.path.abspath(out), (os.path.abspath(mp4) if mp4 else None)


def use_vertex_colors():
    """El degradado azul→naranja viene como color de vértice: lo conectamos al Base Color."""
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf or bsdf.inputs["Base Color"].is_linked:
            continue
        users = [o for o in bpy.data.objects if o.type == "MESH" and any(s.material == mat for s in o.material_slots)]
        attrs = [a.name for o in users for a in getattr(o.data, "color_attributes", [])]
        if not attrs:
            continue
        node = nt.nodes.new("ShaderNodeVertexColor")
        node.layer_name = attrs[0]
        node.location = (bsdf.location.x - 300, bsdf.location.y)
        nt.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])


def setup_scene(frames):
    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.frame_start = 0
    sc.frame_end = max(1, frames - 1)
    for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            pass
    sc.render.resolution_x = sc.render.resolution_y = 1080
    sc.view_settings.view_transform = "AgX" if "AgX" in [i.identifier for i in sc.view_settings.bl_rna.properties["view_transform"].enum_items] else "Standard"

    # mundo crema
    world = sc.world or bpy.data.worlds.new("Mundo")
    sc.world = world
    world.use_nodes = True
    bgn = world.node_tree.nodes.get("Background")
    if bgn:
        bgn.inputs[0].default_value = (*BG, 1)
        bgn.inputs[1].default_value = 0.55

    # piso que recibe sombra
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    floor = bpy.context.active_object
    floor.name = "Piso"
    m = bpy.data.materials.new("Piso")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*BG, 1)
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1
    floor.data.materials.append(m)

    # luces (mismas direcciones que el editor; Y-arriba → Z-arriba)
    bpy.ops.object.light_add(type="AREA", location=(-3.5, -6, 7))
    key = bpy.context.active_object
    key.name = "Luz_principal"
    key.data.energy = 450
    key.data.size = 4
    bpy.ops.object.light_add(type="AREA", location=(5, -4, 2.5))
    fill = bpy.context.active_object
    fill.name = "Luz_relleno"
    fill.data.energy = 110
    fill.data.size = 4
    fill.data.color = (1, 0.85, 0.75)
    for L in (key, fill):
        c = L.constraints.new("TRACK_TO")
        c.target = bpy.data.objects.get("AWI_root")

    # cámara frontal fija (igual que en el editor: fov vertical 30°)
    target = bpy.data.objects.new("Camara_objetivo", None)
    target.location = (0, 0, 1.35)
    sc.collection.objects.link(target)
    bpy.ops.object.camera_add(location=(0, -9.7, 1.95))
    cam = bpy.context.active_object
    cam.name = "Camara_frontal"
    cam.data.sensor_fit = "VERTICAL"
    cam.data.angle = math.radians(30)
    tc = cam.constraints.new("TRACK_TO")
    tc.target = target
    tc.track_axis = "TRACK_NEGATIVE_Z"
    tc.up_axis = "UP_Y"
    sc.camera = cam


def anim_frames():
    end = 0
    for act in bpy.data.actions:
        end = max(end, act.frame_range[1])
    return int(round(end)) + 1


def main():
    glb, out, mp4 = args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS  # antes de importar: el importador convierte segundos a cuadros con este fps
    bpy.ops.import_scene.gltf(filepath=glb)
    use_vertex_colors()
    setup_scene(anim_frames() - 1)  # el último cuadro del .glb repite el primero (loop)
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print("AWI: .blend guardado en", out)
    if mp4:
        sc = bpy.context.scene
        sc.render.image_settings.file_format = "FFMPEG"
        sc.render.ffmpeg.format = "MPEG4"
        sc.render.ffmpeg.codec = "H264"
        sc.render.filepath = mp4
        bpy.ops.render.render(animation=True)
        print("AWI: MP4 renderizado en", mp4)


main()
