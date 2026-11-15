import base64
import bpy
import bmesh
import json
import math
import os
import random
import struct

random.seed(42)

OUT_DIR = "/Users/nourmtir/Documents/fungi communication"
RENDERS_DIR = os.path.join(OUT_DIR, "renders")
os.makedirs(RENDERS_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# 1. RESET SCENE & HIGH-CONTRAST STUDIO RENDER SETTINGS
# ---------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1360
scene.render.resolution_y = 880
try:
    scene.view_settings.look = "AgX - Medium High Contrast"
except Exception:
    pass

# World background (linear RGB). Exported to the web so its sky/ambient match the renders.
WORLD_DAY = (0.048, 0.24, 0.46)
WORLD_NIGHT = (0.014, 0.022, 0.082)
WORLD_STRENGTH = 1.0

world = bpy.data.worlds.new("ForestWorld")
scene.world = world
bg_node = world.node_tree.nodes.get("Background")


def make_collection(name):
    col = bpy.data.collections.new(name)
    scene.collection.children.link(col)
    return col


col_soil = make_collection("1_Soil_Cutaway")
col_plants = make_collection("2_Trees_And_Plants")
col_roots = make_collection("3_Branching_Wire_Roots")
col_fungi = make_collection("4_Mycelium_Network")
col_minerals = make_collection("5_Mineral_Pockets")
col_sky = make_collection("6_Celestial_Sky")


def move_to_collection(obj, target_col):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    target_col.objects.link(obj)


def set_shading(obj, smooth=True):
    if obj.type == "MESH" and obj.data:
        for poly in obj.data.polygons:
            poly.use_smooth = smooth


# ---------------------------------------------------------------------------
# 2. LUSH PAINTERLY INDIE-GAME MATERIALS (Last Campfire / Potion Witch Palette)
# ---------------------------------------------------------------------------
MAT_META = {}


def make_mat(name, base_rgb, roughness=0.72, emission_rgb=None, emission_strength=0.0, alpha=1.0, role="solid", smooth=True):
    mat = bpy.data.materials.new(name=name)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*base_rgb, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha
        if emission_rgb and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission_rgb, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    MAT_META[name] = {
        "color": [round(c, 4) for c in base_rgb],
        "emission": [round(c, 4) for c in (emission_rgb or [0, 0, 0])],
        "emissionStrength": round(emission_strength, 3),
        "alpha": round(alpha, 3),
        "roughness": round(roughness, 3),
        "role": role,
        "smooth": smooth,
    }
    return mat


# Rich Emerald-Jade & Sunlit Moss Terrain
mat_moss = make_mat("MossFloor", (0.08, 0.44, 0.19), roughness=0.82, role="terrain")
mat_grass = make_mat("LushGrass", (0.30, 0.75, 0.16), roughness=0.70, role="terrain")
mat_soil_rim = make_mat("TopsoilRim", (0.38, 0.20, 0.09), roughness=0.88, role="solid", smooth=False)
mat_cutaway_earth = make_mat("CutawayEarthShell", (0.075, 0.048, 0.042), roughness=0.95, role="cutaway_shell", smooth=False)
mat_soil_wall = make_mat("SoilCutaway", (0.09, 0.058, 0.046), roughness=0.95, alpha=0.35, role="soil_glass", smooth=False)
mat_bedrock = make_mat("DeepBedrock", (0.048, 0.052, 0.085), roughness=0.92, role="bedrock", smooth=False)

# Smooth River-Worn Mossy Boulders, Ancient Forest Rune Shrine & Deep Geode Rocks
mat_boulder = make_mat("SurfaceBoulder", (0.34, 0.43, 0.52), roughness=0.74, role="boulder")
mat_boulder_moss = make_mat("BoulderMossCap", (0.14, 0.58, 0.24), roughness=0.78, role="terrain")
mat_rune_stone = make_mat("AncientRuneStone", (0.24, 0.36, 0.34), roughness=0.78, role="boulder")
mat_rune_glow = make_mat(
    "AncientRuneGlow",
    (0.24, 0.96, 0.88),
    roughness=0.20,
    emission_rgb=(0.18, 0.94, 0.86),
    emission_strength=2.60,
    role="mushroom_glow",
    smooth=False,
)
mat_rock_pocket = make_mat("RockPocket", (0.12, 0.19, 0.30), roughness=0.80, role="solid", smooth=False)
mat_mineral = make_mat(
    "MineralCrystal",
    (0.06, 0.72, 1.0),
    roughness=0.14,
    emission_rgb=(0.05, 0.68, 1.0),
    emission_strength=1.75,
    role="emissive_mineral",
    smooth=False,
)

# Multi-Tone Painterly Evergreen & Birch Foliage
mat_fir_trunk = make_mat("FirBark", (0.44, 0.21, 0.09), roughness=0.85, role="solid")
mat_fir_deep = make_mat("FirNeedlesDeep", (0.03, 0.28, 0.20), roughness=0.70, role="canopy_fir")
mat_fir_mid = make_mat("FirNeedlesMid", (0.07, 0.46, 0.23), roughness=0.68, role="canopy_fir")
mat_fir_crown = make_mat("FirNeedlesCrown", (0.22, 0.66, 0.20), roughness=0.66, role="canopy_fir")
mat_sapling_leaf = make_mat("SaplingNeedles", (0.26, 0.70, 0.22), roughness=0.66, role="canopy_sapling")

mat_birch_trunk = make_mat("BirchBark", (0.96, 0.93, 0.88), roughness=0.55, role="solid")
mat_birch_deep = make_mat("BirchLeavesDeep", (0.06, 0.36, 0.24), roughness=0.68, role="canopy_birch")
mat_birch_jade = make_mat("BirchLeavesJade", (0.13, 0.56, 0.25), roughness=0.66, role="canopy_birch")
mat_birch_lime = make_mat("BirchLeavesLime", (0.38, 0.78, 0.16), roughness=0.64, role="canopy_birch")

# Warm Copper-Woody Branching Wire Roots (subtle warm sap subsurface glow keeps them rich in deep soil!)
mat_root_main = make_mat(
    "WoodyRootMain",
    (0.64, 0.28, 0.09),
    roughness=0.74,
    emission_rgb=(0.46, 0.17, 0.04),
    emission_strength=0.15,
    role="root",
)
mat_root_wire = make_mat(
    "WoodyRootWire",
    (0.78, 0.41, 0.13),
    roughness=0.68,
    emission_rgb=(0.56, 0.24, 0.05),
    emission_strength=0.18,
    role="root",
)

# Two-Tone Bioluminescent Mycelium Web (Vibrant Chartreuse-Lime + Spirit Cyan-Aqua!)
mat_mycelium = make_mat(
    "MyceliumGlow",
    (0.46, 0.96, 0.18),
    roughness=0.28,
    emission_rgb=(0.38, 0.94, 0.14),
    emission_strength=1.80,
    role="emissive_mycelium",
)
mat_mycelium_aqua = make_mat(
    "MyceliumAquaGlow",
    (0.16, 0.92, 0.68),
    roughness=0.28,
    emission_rgb=(0.12, 0.88, 0.64),
    emission_strength=1.65,
    role="emissive_mycelium",
)
mat_handshake = make_mat(
    "HandshakeHalo",
    (0.74, 0.99, 0.26),
    roughness=0.22,
    emission_rgb=(0.66, 0.98, 0.20),
    emission_strength=2.35,
    role="emissive_handshake",
)

# Enchanted Smooth Mushrooms + Bioluminescent Forest Spirit Flowers!
mat_mush_stem = make_mat(
    "MushroomStem",
    (0.97, 0.92, 0.80),
    roughness=0.60,
    emission_rgb=(1.0, 0.78, 0.36),
    emission_strength=0.45,
    role="mushroom_glow",
)
mat_mush_gold = make_mat(
    "MushroomGoldCap",
    (0.98, 0.60, 0.08),
    roughness=0.42,
    emission_rgb=(1.0, 0.64, 0.10),
    emission_strength=1.05,
    role="mushroom_glow",
)
mat_mush_red = make_mat(
    "MushroomRedCap",
    (0.92, 0.17, 0.15),
    roughness=0.42,
    emission_rgb=(0.96, 0.24, 0.14),
    emission_strength=0.35,
    role="mushroom_red",
)
mat_mush_spot = make_mat("MushroomSpot", (0.99, 0.97, 0.93), roughness=0.55, role="solid")

mat_flower_cyan = make_mat(
    "SpiritFlowerCyan",
    (0.32, 0.88, 1.0),
    roughness=0.30,
    emission_rgb=(0.22, 0.82, 1.0),
    emission_strength=1.35,
    role="mushroom_glow",
)
mat_flower_rose = make_mat(
    "WildflowerCoral",
    (0.98, 0.42, 0.56),
    roughness=0.45,
    emission_rgb=(0.98, 0.36, 0.52),
    emission_strength=0.65,
    role="mushroom_glow",
)

mat_ghost = make_mat(
    "GhostPipe",
    (0.96, 0.94, 1.0),
    roughness=0.28,
    emission_rgb=(0.78, 0.56, 1.0),
    emission_strength=0.75,
    role="ghost_plant",
)

# Celestial Sun, Solar Aura, Crescent Moon, Stars & Sunbeams!
mat_sun_orb = make_mat(
    "CelestialSun",
    (1.0, 0.82, 0.24),
    roughness=0.14,
    emission_rgb=(1.0, 0.76, 0.18),
    emission_strength=4.2,
    role="celestial_sun",
)
mat_sun_halo = make_mat(
    "CelestialSunHalo",
    (1.0, 0.72, 0.22),
    roughness=0.35,
    emission_rgb=(1.0, 0.68, 0.18),
    emission_strength=1.8,
    alpha=0.22,
    role="celestial_sun_halo",
)
mat_moon = make_mat(
    "CelestialMoon",
    (1.0, 0.97, 0.86),
    roughness=0.18,
    emission_rgb=(0.96, 0.94, 0.82),
    emission_strength=3.4,
    role="celestial_moon",
)
mat_star = make_mat(
    "NightStar",
    (0.94, 0.98, 1.0),
    roughness=0.20,
    emission_rgb=(0.86, 0.94, 1.0),
    emission_strength=3.1,
    role="night_stars",
    smooth=False,
)
mat_sunbeam = make_mat(
    "DaySunbeam",
    (1.0, 0.94, 0.68),
    roughness=0.50,
    emission_rgb=(1.0, 0.92, 0.60),
    emission_strength=1.2,
    alpha=0.10,
    role="day_sunbeam",
)
mat_sugar_orb = make_mat(
    "SugarOrbPreview",
    (1.0, 0.62, 0.02),
    roughness=0.18,
    emission_rgb=(1.0, 0.55, 0.01),
    emission_strength=1.3,
    role="preview_only",
)
mat_firefly_preview = make_mat(
    "FireflyPreview",
    (0.82, 1.0, 0.28),
    roughness=0.15,
    emission_rgb=(0.78, 1.0, 0.22),
    emission_strength=4.2,
    role="preview_only",
)


def b2gl(pt):
    return [round(pt[0], 4), round(pt[2], 4), round(-pt[1], 4)]


# ---------------------------------------------------------------------------
# 3. HIGH-CRAFT SMOOTH 3D BUILDERS (Smooth Boughs, Wire Roots, Smooth Moon!)
# ---------------------------------------------------------------------------
def make_bezier_tube(name, points, r_start, r_end, material, target_col, res_u=7, bevel_res=2):
    curve_data = bpy.data.curves.new(name=name + "_Curve", type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = res_u
    curve_data.bevel_depth = 1.0
    curve_data.bevel_resolution = bevel_res
    curve_data.use_fill_caps = True

    spline = curve_data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    spline.use_smooth = True
    for i, pt in enumerate(points):
        bp = spline.bezier_points[i]
        bp.co = (pt[0], pt[1], pt[2])
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"
        frac = i / max(1, len(points) - 1)
        # Organic non-linear root taper
        bp.radius = r_start * ((1.0 - frac) ** 0.72) + r_end * (frac ** 0.72)

    obj = bpy.data.objects.new(name, curve_data)
    obj.data.materials.append(material)
    move_to_collection(obj, target_col)
    return obj


def make_sculpted_spruce_tier(name, loc, radius, height, lobes, twist, tilt_xy, material, target_col):
    """Smooth, plush, sculpted evergreen bough skirt with soft scalloped tips (28 radial segments)."""
    bm = bmesh.new()
    n_seg = lobes * 4  # 28 or 32 smooth segments around!
    apex = bm.verts.new((tilt_xy[0], tilt_xy[1], height * 0.56))
    bot_hub = bm.verts.new((0.0, 0.0, -height * 0.24))

    mid_ring = []
    rim_ring = []
    for i in range(n_seg):
        ang = (i / n_seg) * math.tau + twist
        lobe_wave = 0.5 + 0.5 * math.cos(ang * lobes)
        # Mid-belly slight outward curve so cone profile is plush & organic!
        r_mid = radius * (0.52 + 0.05 * lobe_wave)
        z_mid = height * 0.06
        mid_ring.append(bm.verts.new((tilt_xy[0] * 0.4 + math.cos(ang) * r_mid, tilt_xy[1] * 0.4 + math.sin(ang) * r_mid, z_mid)))

        r_rim = radius * (0.86 + 0.16 * lobe_wave)
        # Tips swoop gently outward and slightly up on lobes
        z_rim = -height * (0.44 - 0.07 * lobe_wave)
        rim_ring.append(bm.verts.new((math.cos(ang) * r_rim, math.sin(ang) * r_rim, z_rim)))

    for i in range(n_seg):
        j = (i + 1) % n_seg
        bm.faces.new((mid_ring[i], mid_ring[j], apex))
        bm.faces.new((rim_ring[i], rim_ring[j], mid_ring[j], mid_ring[i]))
        bm.faces.new((rim_ring[j], rim_ring[i], bot_hub))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name + "_Mesh")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    obj.data.materials.append(material)
    set_shading(obj, smooth=True)
    move_to_collection(obj, target_col)
    return obj


def make_sculpted_evergreen(prefix, base_pos, scale_f, is_hero, target_col):
    bx, by, bz = base_pos
    # Smooth curved organic trunk with root-flare base
    make_bezier_tube(
        f"{prefix}_Trunk",
        [
            (bx, by, bz - 0.08),
            (bx + 0.02 * scale_f, by - 0.01 * scale_f, bz + 0.75 * scale_f),
            (bx - 0.02 * scale_f, by + 0.02 * scale_f, bz + 1.65 * scale_f),
            (bx + 0.01 * scale_f, by, bz + 2.55 * scale_f),
        ],
        0.26 * scale_f,
        0.05 * scale_f,
        mat_fir_trunk,
        target_col,
        res_u=7,
        bevel_res=3,
    )

    tiers = [
        (0.95, 1.22, 1.02, 8, 0.0, (0.02, -0.01), mat_fir_deep),
        (1.50, 1.02, 0.96, 8, 0.25, (-0.02, 0.02), mat_fir_deep if not is_hero else mat_fir_mid),
        (2.04, 0.80, 0.90, 7, 0.50, (0.02, 0.01), mat_fir_mid),
        (2.54, 0.58, 0.82, 7, 0.18, (-0.02, -0.01), mat_fir_crown),
        (2.96, 0.36, 0.72, 6, 0.42, (0.01, 0.02), mat_fir_crown),
    ]
    for idx, (z_off, rad, ht, lobes, tw, tilt, lmat) in enumerate(tiers):
        make_sculpted_spruce_tier(
            f"{prefix}_Tier_{idx}",
            (bx, by, bz + z_off * scale_f),
            rad * scale_f,
            ht * scale_f,
            lobes,
            tw,
            (tilt[0] * scale_f, tilt[1] * scale_f),
            lmat,
            target_col,
        )


def make_smooth_crescent_moon(name, loc, radius, thickness, material, target_col):
    """Smooth sculpted 3D crescent moon with rounded bevel profile (32 steps)."""
    bm = bmesh.new()
    steps = 30
    rings = []
    # 5 profile angles around cross-section so moon is plump & smooth!
    prof = [(-1.0, 0.0), (-0.45, 0.85), (0.0, 1.0), (0.45, 0.85), (1.0, 0.0)]
    for i in range(steps + 1):
        u = -1.0 + 2.0 * (i / steps)
        ang = u * 2.08
        ox = math.cos(ang) * radius
        oz = math.sin(ang) * radius
        taper = max(0.0, 1.0 - u * u)
        ix = ox - radius * 0.52 * taper
        iz = oz + radius * 0.13 * taper
        mx, mz = (ox + ix) * 0.5, (oz + iz) * 0.5
        hx, hz = (ox - ix) * 0.5, (oz - iz) * 0.5

        loop_v = []
        # Full closed loop around cross-section (front -> outer -> back -> inner)
        pts_loop = [
            (ox, 0.0, oz),
            (mx + hx * 0.45, -thickness * 0.85 * taper, mz + hz * 0.45),
            (mx, -thickness * taper, mz),
            (mx - hx * 0.45, -thickness * 0.75 * taper, mz - hz * 0.45),
            (ix, 0.0, iz),
            (mx - hx * 0.45, thickness * 0.75 * taper, mz - hz * 0.45),
            (mx, thickness * taper, mz),
            (mx + hx * 0.45, thickness * 0.85 * taper, mz + hz * 0.45),
        ]
        for px, py, pz in pts_loop:
            loop_v.append(bm.verts.new((px, py, pz)))
        rings.append(loop_v)

    n_p = 8
    for i in range(steps):
        for k in range(n_p):
            kn = (k + 1) % n_p
            v00 = rings[i][k]
            v10 = rings[i + 1][k]
            v11 = rings[i + 1][kn]
            v01 = rings[i][kn]
            bm.faces.new((v00, v10, v11, v01))

    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.002)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name + "_Mesh")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    obj.rotation_euler = (0.06, -0.32, 0.0)
    obj.data.materials.append(material)
    set_shading(obj, smooth=True)
    move_to_collection(obj, target_col)
    return obj


# ---------------------------------------------------------------------------
# 4. SMOOTH SCULPTED MOSSY GLADE TERRAIN + SMART CUTAWAY BLOCK
# ---------------------------------------------------------------------------
W_X, W_Y = 8.6, 5.5


def terrain_height(x, y):
    back_rise = 0.26 * max(0.0, (y - 0.45) / (W_Y * 0.5)) ** 1.35
    wave = 0.11 * math.sin(x * 0.65) * math.cos(y * 0.70) + 0.05 * math.cos((x - y) * 0.90)
    return wave + back_rise


bm = bmesh.new()
nx, ny = 34, 22
grid_verts = []
for iy in range(ny + 1):
    row = []
    vy = -W_Y / 2 + (iy / ny) * W_Y
    for ix in range(nx + 1):
        vx = -W_X / 2 + (ix / nx) * W_X
        vz = terrain_height(vx, vy)
        row.append(bm.verts.new((vx, vy, vz)))
    grid_verts.append(row)

for iy in range(ny):
    for ix in range(nx):
        bm.faces.new((grid_verts[iy][ix], grid_verts[iy][ix + 1], grid_verts[iy + 1][ix + 1], grid_verts[iy + 1][ix]))

mesh_moss = bpy.data.meshes.new("MossSurfaceMesh")
bm.to_mesh(mesh_moss)
bm.free()
obj_moss = bpy.data.objects.new("MossSurface", mesh_moss)
obj_moss.data.materials.append(mat_moss)
set_shading(obj_moss, smooth=True)
move_to_collection(obj_moss, col_soil)
mod_solid = obj_moss.modifiers.new("MossLip", "SOLIDIFY")
mod_solid.thickness = 0.14
mod_solid.offset = -1.0

bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, -0.22))
obj_rim = bpy.context.active_object
obj_rim.name = "TopsoilRimBand"
obj_rim.scale = (W_X * 0.998, W_Y * 0.998, 0.15)
bpy.ops.object.transform_apply(scale=True)
obj_rim.data.materials.append(mat_soil_rim)
set_shading(obj_rim, smooth=False)
move_to_collection(obj_rim, col_soil)

# Smart 360° inward-facing 4-wall cutaway shell
bm_shell = bmesh.new()
hx, hy = W_X * 0.496, W_Y * 0.496
z_top, z_bot = -0.26, -3.18
c_fl_t = bm_shell.verts.new((-hx, -hy, z_top))
c_fr_t = bm_shell.verts.new((hx, -hy, z_top))
c_br_t = bm_shell.verts.new((hx, hy, z_top))
c_bl_t = bm_shell.verts.new((-hx, hy, z_top))
c_fl_b = bm_shell.verts.new((-hx, -hy, z_bot))
c_fr_b = bm_shell.verts.new((hx, -hy, z_bot))
c_br_b = bm_shell.verts.new((hx, hy, z_bot))
c_bl_b = bm_shell.verts.new((-hx, hy, z_bot))
bm_shell.faces.new((c_bl_b, c_br_b, c_br_t, c_bl_t))
bm_shell.faces.new((c_fr_b, c_fl_b, c_fl_t, c_fr_t))
bm_shell.faces.new((c_fl_b, c_bl_b, c_bl_t, c_fl_t))
bm_shell.faces.new((c_br_b, c_fr_b, c_fr_t, c_br_t))

mesh_shell = bpy.data.meshes.new("CutawayShellMesh")
bm_shell.to_mesh(mesh_shell)
bm_shell.free()
obj_shell = bpy.data.objects.new("CutawayEarthShell", mesh_shell)
obj_shell.data.materials.append(mat_cutaway_earth)
obj_shell.hide_render = True
move_to_collection(obj_shell, col_soil)

mat_render_back = make_mat("RenderBackEarth", (0.08, 0.055, 0.048), roughness=0.95, role="preview_only", smooth=False)
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, hy - 0.03, (z_top + z_bot) * 0.5))
obj_render_back = bpy.context.active_object
obj_render_back.name = "RenderBackWall"
obj_render_back.scale = (W_X * 0.99, 0.05, z_top - z_bot)
bpy.ops.object.transform_apply(scale=True)
obj_render_back.data.materials.append(mat_render_back)
move_to_collection(obj_render_back, col_soil)

bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, -1.72))
obj_soil = bpy.context.active_object
obj_soil.name = "SoilCutawayVolume"
obj_soil.scale = (W_X * 0.99, W_Y * 0.99, 2.94)
bpy.ops.object.transform_apply(scale=True)
obj_soil.data.materials.append(mat_soil_wall)
obj_soil.hide_render = True
move_to_collection(obj_soil, col_soil)

bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, -3.25))
obj_base = bpy.context.active_object
obj_base.name = "BedrockSlab"
obj_base.scale = (W_X, W_Y, 0.18)
bpy.ops.object.transform_apply(scale=True)
obj_base.data.materials.append(mat_bedrock)
set_shading(obj_base, smooth=False)
move_to_collection(obj_base, col_soil)


# ---------------------------------------------------------------------------
# 5. HIGH-CRAFT TREES, SMOOTH BOULDERS, MUSHROOMS & SPIRIT FLOWERS
# ---------------------------------------------------------------------------
FIR_POS = (-2.48, 0.15, terrain_height(-2.48, 0.15))
make_sculpted_evergreen("ElderFir", FIR_POS, 1.06, True, col_plants)

for idx, (px, py, sc) in enumerate([(-3.62, 1.68, 0.70), (-1.28, 1.85, 0.78), (3.42, 1.65, 0.66)]):
    make_sculpted_evergreen(f"BgPine_{idx}", (px, py, terrain_height(px, py)), sc, False, col_plants)

# Shaded Baby Sapling
SAP_POS = (-0.15, -0.35, terrain_height(-0.15, -0.35))
make_bezier_tube(
    "Sapling_Trunk",
    [(SAP_POS[0], SAP_POS[1], SAP_POS[2] - 0.05), (SAP_POS[0] + 0.01, SAP_POS[1], SAP_POS[2] + 0.95)],
    0.072,
    0.022,
    mat_fir_trunk,
    col_plants,
    res_u=6,
    bevel_res=2,
)
for idx, (z_off, rad, ht, tw) in enumerate([(0.48, 0.44, 0.50, 0.0), (0.82, 0.32, 0.44, 0.35), (1.10, 0.20, 0.36, 0.70)]):
    make_sculpted_spruce_tier(
        f"Sapling_Tier_{idx}",
        (SAP_POS[0], SAP_POS[1], SAP_POS[2] + z_off),
        rad,
        ht,
        6,
        tw,
        (0.01, 0.0),
        mat_sapling_leaf,
        col_plants,
    )

# Painterly Multi-Tone Paper Birch with Smooth Sculpted Canopy Clouds!
BIRCH_POS = (2.02, 0.16, terrain_height(2.02, 0.16))
make_bezier_tube(
    "Birch_MainTrunk",
    [
        (BIRCH_POS[0], BIRCH_POS[1], BIRCH_POS[2] - 0.08),
        (BIRCH_POS[0] - 0.06, BIRCH_POS[1] + 0.03, BIRCH_POS[2] + 1.05),
        (BIRCH_POS[0] + 0.07, BIRCH_POS[1] - 0.04, BIRCH_POS[2] + 2.22),
    ],
    0.19,
    0.065,
    mat_birch_trunk,
    col_plants,
    res_u=8,
    bevel_res=3,
)
make_bezier_tube(
    "Birch_BranchL",
    [
        (BIRCH_POS[0] - 0.02, BIRCH_POS[1], BIRCH_POS[2] + 1.18),
        (BIRCH_POS[0] - 0.44, BIRCH_POS[1] + 0.20, BIRCH_POS[2] + 1.78),
        (BIRCH_POS[0] - 0.72, BIRCH_POS[1] + 0.28, BIRCH_POS[2] + 2.18),
    ],
    0.095,
    0.035,
    mat_birch_trunk,
    col_plants,
    res_u=7,
    bevel_res=2,
)
make_bezier_tube(
    "Birch_BranchR",
    [
        (BIRCH_POS[0] + 0.03, BIRCH_POS[1], BIRCH_POS[2] + 1.30),
        (BIRCH_POS[0] + 0.48, BIRCH_POS[1] - 0.22, BIRCH_POS[2] + 1.88),
        (BIRCH_POS[0] + 0.74, BIRCH_POS[1] - 0.28, BIRCH_POS[2] + 2.28),
    ],
    0.090,
    0.035,
    mat_birch_trunk,
    col_plants,
    res_u=7,
    bevel_res=2,
)

BIRCH_CLOUDS = [
    (0.04, -0.02, 2.58, 0.74, mat_birch_lime),
    (-0.68, 0.26, 2.26, 0.58, mat_birch_jade),
    (0.72, -0.28, 2.34, 0.58, mat_birch_lime),
    (-0.28, -0.38, 2.16, 0.55, mat_birch_deep),
    (0.32, 0.38, 2.22, 0.56, mat_birch_jade),
    (-0.36, 0.14, 2.52, 0.48, mat_birch_lime),
    (0.42, -0.06, 2.54, 0.46, mat_birch_lime),
]
for idx, (dx, dy, dz, rad, bmat) in enumerate(BIRCH_CLOUDS):
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=3, radius=rad, location=(BIRCH_POS[0] + dx, BIRCH_POS[1] + dy, BIRCH_POS[2] + dz)
    )
    puff = bpy.context.active_object
    puff.name = f"Birch_Foliage_{idx}"
    # Gentle organic cloud sculpting!
    for v in puff.data.vertices:
        co = v.co
        w = 1.0 + 0.08 * math.sin(co.x * 5.0 + idx) * math.cos(co.y * 5.0)
        v.co.x *= w * 1.12
        v.co.y *= w * 1.04
        v.co.z *= w * 0.78
    puff.data.materials.append(bmat)
    set_shading(puff, smooth=True)
    move_to_collection(puff, col_plants)

# Ancient Mossy Forest Rune Shrine (echoing Last Campfire / Arco / Enchanted Shrine references!)
SHRINE_X, SHRINE_Y = -0.78, 0.88
SHRINE_Z = terrain_height(SHRINE_X, SHRINE_Y)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0, location=(SHRINE_X, SHRINE_Y, SHRINE_Z + 0.34))
shrine_tablet = bpy.context.active_object
shrine_tablet.name = "MossyRuneShrine"
for v in shrine_tablet.data.vertices:
    d = 1.0 + 0.07 * math.sin(v.co.x * 4.0) * math.cos(v.co.z * 3.5)
    v.co.x *= 0.36 * d * (0.82 if v.co.z > 0.3 else 1.05)
    v.co.y *= 0.16 * d
    v.co.z *= (0.34 if v.co.z < 0 else 0.56) * d
shrine_tablet.data.materials.append(mat_rune_stone)
set_shading(shrine_tablet, smooth=True)
move_to_collection(shrine_tablet, col_plants)

# Mossy cap crowning the ancient rune stone
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0, location=(SHRINE_X, SHRINE_Y, SHRINE_Z + 0.74))
shrine_moss = bpy.context.active_object
shrine_moss.name = "MossyRuneCap"
for v in shrine_moss.data.vertices:
    v.co.x *= 0.31
    v.co.y *= 0.17
    v.co.z *= 0.12 if v.co.z < 0 else 0.18
shrine_moss.data.materials.append(mat_boulder_moss)
set_shading(shrine_moss, smooth=True)
move_to_collection(shrine_moss, col_plants)

# Glowing cyan carved forest runes on the front face of the shrine!
for r_i, (rx_off, rz_off, rw, rh) in enumerate([
    (0.0, 0.48, 0.025, 0.22),
    (-0.11, 0.44, 0.020, 0.14),
    (0.11, 0.44, 0.020, 0.14),
    (0.0, 0.64, 0.045, 0.045),
]):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(SHRINE_X + rx_off, SHRINE_Y - 0.155, SHRINE_Z + rz_off))
    rune = bpy.context.active_object
    rune.name = f"ShrineRune_{r_i}"
    rune.scale = (rw, 0.02, rh)
    bpy.ops.object.transform_apply(scale=True)
    rune.data.materials.append(mat_rune_glow)
    set_shading(rune, smooth=False)
    move_to_collection(rune, col_plants)

# Smooth Sculpted Mossy River Boulders
SURFACE_BOULDERS = [
    (-1.55, 0.85, (0.48, 0.38, 0.32), 0.4),
    (-1.84, 0.52, (0.25, 0.22, 0.18), 1.1),
    (0.68, 1.05, (0.52, 0.42, 0.34), 0.9),
    (1.10, 0.82, (0.27, 0.24, 0.20), 0.2),
    (-3.38, -0.95, (0.36, 0.30, 0.24), -0.4),
    (2.68, 0.72, (0.35, 0.28, 0.23), 0.8),
]
for idx, (rx, ry, rscale, rseed) in enumerate(SURFACE_BOULDERS):
    rz = terrain_height(rx, ry) + rscale[2] * 0.28
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0, location=(rx, ry, rz))
    boulder = bpy.context.active_object
    boulder.name = f"SurfaceBoulder_{idx}"
    for v in boulder.data.vertices:
        d = 1.0 + 0.12 * math.sin(v.co.x * 3.4 + rseed) * math.cos(v.co.z * 3.1)
        v.co.x *= rscale[0] * d
        v.co.y *= rscale[1] * d
        v.co.z *= rscale[2] * (0.85 if v.co.z < 0 else 1.05) * d
    boulder.data.materials.append(mat_boulder)
    set_shading(boulder, smooth=True)
    move_to_collection(boulder, col_plants)

# Smooth Rounded Enchanted Mushrooms
MUSHROOMS = [
    (-1.15, -0.82, 1.08, True),
    (-0.90, -0.96, 0.68, False),
    (0.92, 0.58, 1.12, False),
    (1.16, 0.44, 0.74, True),
]
for idx, (mx, my, msc, is_red) in enumerate(MUSHROOMS):
    mz = terrain_height(mx, my)
    make_bezier_tube(
        f"Mushroom_Stem_{idx}",
        [(mx, my, mz - 0.05), (mx + 0.02 * msc, my, mz + 0.16 * msc), (mx, my, mz + 0.31 * msc)],
        0.048 * msc,
        0.032 * msc,
        mat_mush_stem,
        col_plants,
        res_u=6,
        bevel_res=2,
    )
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=20, ring_count=10, radius=0.20 * msc, location=(mx, my, mz + 0.30 * msc)
    )
    cap = bpy.context.active_object
    cap.name = f"Mushroom_Cap_{idx}"
    for v in cap.data.vertices:
        if v.co.z < 0:
            v.co.z *= 0.22  # Flattened gill underside, plump dome on top!
        else:
            v.co.z *= 0.78
    cap.data.materials.append(mat_mush_red if is_red else mat_mush_gold)
    set_shading(cap, smooth=True)
    move_to_collection(cap, col_plants)

    if is_red:
        for s_i in range(5):
            ang = s_i * 1.25 + 0.3
            sx = mx + math.cos(ang) * 0.11 * msc
            sy = my + math.sin(ang) * 0.11 * msc
            sz = mz + 0.38 * msc
            bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=0.024 * msc, location=(sx, sy, sz))
            spot = bpy.context.active_object
            spot.data.materials.append(mat_mush_spot)
            set_shading(spot, smooth=True)
            move_to_collection(spot, col_plants)

# Bioluminescent Spirit Buds & Wildflowers in the Mossy Glade (Potion Witch / Last Campfire!)
FLOWER_SPOTS = [
    (-1.42, -0.52, True), (-0.62, -0.74, False), (0.32, -0.58, True),
    (0.68, 0.28, False), (1.48, -0.32, True), (-2.02, -0.58, False),
    (2.58, -0.42, True), (-0.42, 0.36, True),
]
for f_idx, (fx, fy, is_cyan) in enumerate(FLOWER_SPOTS):
    fz = terrain_height(fx, fy)
    make_bezier_tube(
        f"SpiritStem_{f_idx}",
        [(fx, fy, fz - 0.03), (fx + 0.02, fy, fz + 0.14), (fx + 0.04, fy - 0.02, fz + 0.24)],
        0.014,
        0.009,
        mat_grass,
        col_plants,
        res_u=4,
        bevel_res=1,
    )
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=12, ring_count=8, radius=0.046, location=(fx + 0.04, fy - 0.02, fz + 0.25)
    )
    bud = bpy.context.active_object
    bud.scale = (0.85, 0.85, 1.25)
    bpy.ops.object.transform_apply(scale=True)
    bud.data.materials.append(mat_flower_cyan if is_cyan else mat_flower_rose)
    set_shading(bud, smooth=True)
    move_to_collection(bud, col_plants)

# Lush Curved Grass Blades
bm_grass = bmesh.new()
GRASS_SPOTS = [
    (-2.05, -0.45), (-1.75, -0.85), (-1.35, -0.35), (-0.75, -0.82), (-0.52, 0.25),
    (0.25, -0.65), (0.48, 0.18), (0.82, -0.42), (1.38, -0.25), (1.58, 0.62),
    (2.45, -0.42), (-2.95, 0.65), (-0.85, 1.12), (0.15, 0.95), (2.85, 0.15),
    (-1.45, 0.35), (0.55, 0.68), (-2.75, -0.68), (1.75, -0.88), (2.95, -0.52),
    (-0.05, -0.88), (-1.85, 0.15), (1.15, -0.72), (2.22, 0.72),
]
for gx, gy in GRASS_SPOTS:
    gz = terrain_height(gx, gy) - 0.02
    for b_i in range(4):
        ang = b_i * 1.57 + random.uniform(-0.35, 0.35)
        dx, dy = math.cos(ang) * 0.04, math.sin(ang) * 0.04
        lean_x, lean_y = -dy * 2.5, dx * 2.5
        h = random.uniform(0.18, 0.30)
        v1 = bm_grass.verts.new((gx - dx, gy - dy, gz))
        v2 = bm_grass.verts.new((gx + dx, gy + dy, gz))
        vm1 = bm_grass.verts.new((gx - dx * 0.4 + lean_x * 0.4, gy - dy * 0.4 + lean_y * 0.4, gz + h * 0.55))
        vm2 = bm_grass.verts.new((gx + dx * 0.4 + lean_x * 0.4, gy + dy * 0.4 + lean_y * 0.4, gz + h * 0.55))
        v3 = bm_grass.verts.new((gx + lean_x, gy + lean_y, gz + h))
        bm_grass.faces.new((v1, v2, vm2, vm1))
        bm_grass.faces.new((vm1, vm2, v3))

mesh_grass = bpy.data.meshes.new("GrassTuftsMesh")
bm_grass.to_mesh(mesh_grass)
bm_grass.free()
obj_grass = bpy.data.objects.new("GrassTufts", mesh_grass)
obj_grass.data.materials.append(mat_grass)
set_shading(obj_grass, smooth=True)
move_to_collection(obj_grass, col_plants)

# Smooth Sculpted White Ghost Pipes
GHOST_POS = (3.32, -0.82, terrain_height(3.32, -0.82))
for idx, (ox, oy, ht) in enumerate([(-0.14, 0.06, 0.60), (0.0, -0.05, 0.76), (0.14, 0.08, 0.54)]):
    gx, gy, gz = GHOST_POS[0] + ox, GHOST_POS[1] + oy, GHOST_POS[2]
    make_bezier_tube(
        f"GhostPipe_Stem_{idx}",
        [
            (gx, gy, gz - 0.08),
            (gx, gy, gz + ht * 0.65),
            (gx + 0.06, gy - 0.04, gz + ht),
            (gx + 0.16, gy - 0.08, gz + ht - 0.09),
        ],
        0.036,
        0.025,
        mat_ghost,
        col_plants,
        res_u=8,
        bevel_res=2,
    )
    bpy.ops.mesh.primitive_cone_add(
        vertices=16,
        radius1=0.075,
        radius2=0.028,
        depth=0.15,
        location=(gx + 0.17, gy - 0.09, gz + ht - 0.12),
        rotation=(0.35, 0.55, 0),
    )
    bell = bpy.context.active_object
    bell.name = f"GhostPipe_Bell_{idx}"
    bell.data.materials.append(mat_ghost)
    set_shading(bell, smooth=True)
    move_to_collection(bell, col_plants)


# ---------------------------------------------------------------------------
# 6. TRUE WIRE-LIKE BRANCHING ROOT SYSTEMS! (Sinewy Cables + Intertwined Wire Forks + Capillaries)
# ---------------------------------------------------------------------------
def gnarly_pts(p_start, p_end, n_mid=4, wiggle=0.16):
    pts = [p_start]
    for i in range(1, n_mid + 1):
        f = i / (n_mid + 1)
        flare = math.sin(f * math.pi)
        wx = math.sin(f * 8.4 + p_end[0] * 2.3) * wiggle * flare
        wy = math.cos(f * 7.6 + p_end[1] * 2.5) * wiggle * flare
        pts.append(
            (
                p_start[0] + (p_end[0] - p_start[0]) * f + wx,
                p_start[1] + (p_end[1] - p_start[1]) * f + wy,
                p_start[2] + (p_end[2] - p_start[2]) * (f ** 0.85),
            )
        )
    pts.append(p_end)
    return pts


PRIMARY_TARGETS = {
    "fir_r1": (FIR_POS, (-3.62, -0.84, -1.68)),
    "fir_r2": (FIR_POS, (-2.68, -1.26, -1.78)),
    "fir_r3": (FIR_POS, (-1.28, -0.56, -1.66)),
    "fir_r4": (FIR_POS, (-1.62, 1.34, -1.64)),
    "fir_r5": (FIR_POS, (-3.48, 1.28, -1.62)),
    "fir_r6": (FIR_POS, (-2.38, 0.14, -1.84)),
    "sap_r1": (SAP_POS, (-0.84, -0.82, -1.32)),
    "sap_r2": (SAP_POS, (0.54, -0.74, -1.34)),
    "sap_r3": (SAP_POS, (-0.06, 0.36, -1.36)),
    "sap_r4": (SAP_POS, (-0.18, -0.32, -1.46)),
    "birch_r1": (BIRCH_POS, (1.02, -0.66, -1.66)),
    "birch_r2": (BIRCH_POS, (1.94, -1.18, -1.74)),
    "birch_r3": (BIRCH_POS, (3.06, -0.72, -1.60)),
    "birch_r4": (BIRCH_POS, (1.42, 1.28, -1.64)),
    "birch_r5": (BIRCH_POS, (3.16, 1.20, -1.60)),
    "birch_r6": (BIRCH_POS, (2.06, 0.14, -1.82)),
    "ghost_r1": (GHOST_POS, (3.15, -0.76, -1.04)),
}

ROOT_PATHS = {}
FINE_WIRE_TIPS = []

for rname, (origin, tip) in PRIMARY_TARGETS.items():
    is_sap = rname.startswith("sap")
    is_ghost = rname.startswith("ghost")
    start_pt = (origin[0], origin[1], origin[2] + 0.05)
    pts = gnarly_pts(start_pt, tip, n_mid=4, wiggle=0.08 if (is_sap or is_ghost) else 0.17)
    ROOT_PATHS[rname] = pts

    # Sinewy, cable-like root proportions rather than stubby cones!
    r0 = 0.032 if is_ghost else (0.048 if is_sap else 0.098)
    r1 = 0.010 if is_ghost else (0.010 if is_sap else 0.014)
    mat_r = mat_ghost if is_ghost else mat_root_main

    make_bezier_tube(f"Root_{rname}", pts, r0, r1, mat_r, col_roots, res_u=11, bevel_res=2)

    if not is_ghost:
        # Spawn 3 long sinuous wire-like secondary root branches + fine capillary rootlet wires!
        for fork_idx, idx_pt in enumerate([1, 2, 3]):
            anchor = pts[idx_pt]
            ang = ((hash(rname) + fork_idx * 211) % 628) / 100.0
            span = 0.42 if is_sap else 0.72
            fork_end = (
                max(-3.95, min(3.95, anchor[0] + math.cos(ang) * span)),
                max(-2.35, min(2.35, anchor[1] + math.sin(ang) * span)),
                max(-2.38, anchor[2] - random.uniform(0.42, 0.76)),
            )
            fork_pts = gnarly_pts(anchor, fork_end, n_mid=3, wiggle=0.11)
            make_bezier_tube(
                f"RootWire_{rname}_{fork_idx}",
                fork_pts,
                r0 * 0.36,
                0.006,
                mat_root_wire,
                col_roots,
                res_u=9,
                bevel_res=1,
            )
            FINE_WIRE_TIPS.append(fork_end)

            # Fine capillary hair-root wire splitting off each secondary root wire!
            sub_anchor = fork_pts[2]
            sub_ang = ang + (0.85 if fork_idx % 2 == 0 else -0.85)
            sub_end = (
                max(-3.95, min(3.95, sub_anchor[0] + math.cos(sub_ang) * span * 0.62)),
                max(-2.35, min(2.35, sub_anchor[1] + math.sin(sub_ang) * span * 0.62)),
                max(-2.48, sub_anchor[2] - random.uniform(0.24, 0.44)),
            )
            make_bezier_tube(
                f"RootCapillary_{rname}_{fork_idx}",
                gnarly_pts(sub_anchor, sub_end, n_mid=2, wiggle=0.07),
                0.013,
                0.004,
                mat_root_wire,
                col_roots,
                res_u=7,
                bevel_res=1,
            )

        # Silky-smooth glowing spiral mycorrhizal Hartig-net sheath coiled around primary root tip!
        p_prev = pts[-2]
        p_tip = pts[-1]
        coil_pts = []
        for step in range(11):
            u = step / 10.0
            cx = p_prev[0] + (p_tip[0] - p_prev[0]) * (0.30 + 0.70 * u)
            cy = p_prev[1] + (p_tip[1] - p_prev[1]) * (0.30 + 0.70 * u)
            cz = p_prev[2] + (p_tip[2] - p_prev[2]) * (0.30 + 0.70 * u)
            ang = step * 1.45
            rad = 0.032 * (1.0 - 0.38 * u)
            coil_pts.append((cx + math.cos(ang) * rad, cy + math.sin(ang) * rad, cz))
        make_bezier_tube(f"RootGlove_{rname}", coil_pts, 0.012, 0.008, mat_handshake, col_fungi, res_u=9, bevel_res=1)


# ---------------------------------------------------------------------------
# 7. DEEP MINERAL & WATER CRYSTAL GEODES
# ---------------------------------------------------------------------------
PORES = [
    ("pore_1", (-3.25, -0.75, -2.78), "Water"),
    ("pore_2", (-1.65, 0.52, -2.84), "Phosphorus"),
    ("pore_3", (-0.15, -0.68, -2.86), "Nitrogen"),
    ("pore_4", (1.25, 0.45, -2.82), "Phosphorus"),
    ("pore_5", (2.52, -0.72, -2.80), "Water"),
    ("pore_6", (3.20, 0.52, -2.75), "Nitrogen"),
]

for pname, ppos, _ in PORES:
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.36, location=(ppos[0], ppos[1], ppos[2] - 0.08))
    rock = bpy.context.active_object
    rock.name = f"Rock_{pname}"
    rock.scale = (1.25, 1.05, 0.60)
    bpy.ops.object.transform_apply(scale=True)
    rock.data.materials.append(mat_rock_pocket)
    set_shading(rock, smooth=True)
    move_to_collection(rock, col_minerals)

    for c_i, (ox, oy, rot_y, ht) in enumerate([(-0.10, 0.03, -0.34, 0.34), (0.08, -0.04, 0.30, 0.38), (0.0, 0.07, 0.06, 0.28)]):
        bpy.ops.mesh.primitive_cone_add(
            vertices=6,
            radius1=0.085,
            radius2=0.008,
            depth=ht,
            location=(ppos[0] + ox, ppos[1] + oy, ppos[2] + 0.08),
            rotation=(ox * 1.5, rot_y, c_i * 1.1),
        )
        cryst = bpy.context.active_object
        cryst.name = f"Crystal_{pname}_{c_i}"
        cryst.data.materials.append(mat_mineral)
        set_shading(cryst, smooth=False)
        move_to_collection(cryst, col_minerals)


# ---------------------------------------------------------------------------
# 8. ULTRA-FINE FIBROUS 3D MYCELIAL NETWORK (66 Interwoven Glowing Filaments!)
# ---------------------------------------------------------------------------
HUBS = {
    "H1": (-2.85, -0.38, -2.02),
    "H2": (-1.75, 0.25, -1.96),
    "H3": (-0.98, -0.68, -1.90),
    "H4": (-0.05, -0.28, -1.94),
    "H5": (0.95, 0.35, -1.90),
    "H6": (1.62, -0.58, -1.96),
    "H7": (2.55, 0.22, -2.00),
    "H8": (3.08, -0.74, -1.66),
}


def wavy_curve_pts(pa, pb, sag=-0.15, spread=0.20):
    p1 = (
        pa[0] + (pb[0] - pa[0]) * 0.33 + random.uniform(-spread, spread),
        pa[1] + (pb[1] - pa[1]) * 0.33 + random.uniform(-spread, spread),
        pa[2] + (pb[2] - pa[2]) * 0.33 + sag * 0.7 + random.uniform(-0.07, 0.07),
    )
    p2 = (
        pa[0] + (pb[0] - pa[0]) * 0.67 + random.uniform(-spread, spread),
        pa[1] + (pb[1] - pa[1]) * 0.67 + random.uniform(-spread, spread),
        pa[2] + (pb[2] - pa[2]) * 0.67 + sag + random.uniform(-0.07, 0.07),
    )
    return [pa, p1, p2, pb]


MYCELIUM_LINKS = [
    (ROOT_PATHS["fir_r1"][-1], HUBS["H1"], 0.015),
    (ROOT_PATHS["fir_r2"][-1], HUBS["H1"], 0.015),
    (ROOT_PATHS["fir_r2"][-1], HUBS["H3"], 0.013),
    (ROOT_PATHS["fir_r3"][-1], HUBS["H3"], 0.016),
    (ROOT_PATHS["fir_r3"][-1], HUBS["H2"], 0.015),
    (ROOT_PATHS["fir_r4"][-1], HUBS["H2"], 0.014),
    (ROOT_PATHS["fir_r5"][-1], HUBS["H1"], 0.014),
    (ROOT_PATHS["fir_r6"][-1], HUBS["H2"], 0.014),
    (ROOT_PATHS["sap_r1"][-1], HUBS["H3"], 0.015),
    (ROOT_PATHS["sap_r1"][-1], HUBS["H4"], 0.016),
    (ROOT_PATHS["sap_r2"][-1], HUBS["H4"], 0.015),
    (ROOT_PATHS["sap_r2"][-1], HUBS["H6"], 0.014),
    (ROOT_PATHS["sap_r3"][-1], HUBS["H4"], 0.014),
    (ROOT_PATHS["sap_r3"][-1], HUBS["H5"], 0.014),
    (ROOT_PATHS["sap_r4"][-1], HUBS["H4"], 0.014),
    (ROOT_PATHS["birch_r1"][-1], HUBS["H6"], 0.016),
    (ROOT_PATHS["birch_r1"][-1], HUBS["H5"], 0.015),
    (ROOT_PATHS["birch_r2"][-1], HUBS["H6"], 0.015),
    (ROOT_PATHS["birch_r3"][-1], HUBS["H8"], 0.016),
    (ROOT_PATHS["birch_r4"][-1], HUBS["H5"], 0.014),
    (ROOT_PATHS["birch_r5"][-1], HUBS["H7"], 0.015),
    (ROOT_PATHS["birch_r6"][-1], HUBS["H6"], 0.014),
    (HUBS["H8"], ROOT_PATHS["ghost_r1"][-1], 0.016),
    (ROOT_PATHS["birch_r3"][-1], ROOT_PATHS["ghost_r1"][-1], 0.013),
    (HUBS["H3"], (MUSHROOMS[0][0], MUSHROOMS[0][1], terrain_height(MUSHROOMS[0][0], MUSHROOMS[0][1]) - 0.04), 0.014),
    (HUBS["H5"], (MUSHROOMS[2][0], MUSHROOMS[2][1], terrain_height(MUSHROOMS[2][0], MUSHROOMS[2][1]) - 0.04), 0.014),
    (HUBS["H1"], HUBS["H2"], 0.017),
    (HUBS["H1"], HUBS["H3"], 0.017),
    (HUBS["H1"], HUBS["H3"], 0.011),
    (HUBS["H2"], HUBS["H4"], 0.016),
    (HUBS["H3"], HUBS["H4"], 0.018),
    (HUBS["H3"], HUBS["H4"], 0.011),
    (HUBS["H4"], HUBS["H5"], 0.016),
    (HUBS["H4"], HUBS["H6"], 0.018),
    (HUBS["H4"], HUBS["H6"], 0.011),
    (HUBS["H5"], HUBS["H7"], 0.016),
    (HUBS["H6"], HUBS["H7"], 0.016),
    (HUBS["H6"], HUBS["H8"], 0.015),
    (HUBS["H7"], HUBS["H8"], 0.014),
    (HUBS["H1"], PORES[0][1], 0.013),
    (HUBS["H2"], PORES[1][1], 0.013),
    (HUBS["H3"], PORES[1][1], 0.011),
    (HUBS["H3"], PORES[2][1], 0.013),
    (HUBS["H4"], PORES[2][1], 0.014),
    (HUBS["H5"], PORES[3][1], 0.013),
    (HUBS["H6"], PORES[3][1], 0.012),
    (HUBS["H6"], PORES[4][1], 0.013),
    (HUBS["H7"], PORES[5][1], 0.013),
    (HUBS["H8"], PORES[4][1], 0.011),
]

# Also connect 22 secondary fine wire root tips directly into nearest fungal hubs!
hub_list = list(HUBS.values())
for w_idx, wtip in enumerate(FINE_WIRE_TIPS[::2]):
    nearest_hub = min(hub_list, key=lambda h: (h[0] - wtip[0]) ** 2 + (h[1] - wtip[1]) ** 2)
    MYCELIUM_LINKS.append((wtip, nearest_hub, 0.009))

for idx, (pa, pb, rad) in enumerate(MYCELIUM_LINKS):
    m_mat = mat_mycelium_aqua if idx % 4 == 0 else mat_mycelium
    make_bezier_tube(
        f"Hypha_{idx}",
        wavy_curve_pts(pa, pb),
        rad,
        rad * 0.80,
        m_mat,
        col_fungi,
        res_u=9,
        bevel_res=1,
    )


# ---------------------------------------------------------------------------
# 9. CELESTIAL SUN ORB, SOLAR HALO, SMOOTH CRESCENT MOON, STARS & DAY SUNBEAMS
# ---------------------------------------------------------------------------
# Exported at (0,0,0) later so WebGL animates their celestial sunset/moonrise arc!
SUN_DAY_LOC = (0.72, 1.50, 3.88)
bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=14, radius=0.38, location=SUN_DAY_LOC)
sun_orb = bpy.context.active_object
sun_orb.name = "CelestialSunOrb"
sun_orb.data.materials.append(mat_sun_orb)
set_shading(sun_orb, smooth=True)
move_to_collection(sun_orb, col_sky)

bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=0.62, location=SUN_DAY_LOC)
sun_halo = bpy.context.active_object
sun_halo.name = "CelestialSunHalo"
sun_halo.data.materials.append(mat_sun_halo)
set_shading(sun_halo, smooth=True)
sun_halo.hide_render = True
move_to_collection(sun_halo, col_sky)

moon_obj = make_smooth_crescent_moon("CelestialCrescentMoon", (-0.30, 1.45, 3.68), 0.44, 0.11, mat_moon, col_sky)

STAR_COORDS = [
    (-2.05, 1.45, 3.62, 0.062),
    (-1.28, 1.55, 3.96, 0.054),
    (-0.82, 1.25, 3.38, 0.046),
    (0.42, 1.50, 3.98, 0.058),
    (1.18, 1.35, 3.62, 0.068),
    (1.88, 1.55, 3.88, 0.052),
    (-1.62, 1.15, 3.18, 0.044),
    (0.78, 1.18, 3.28, 0.046),
    (2.55, 1.45, 3.52, 0.054),
]
star_objs = []
for s_i, (sx, sy, sz, srad) in enumerate(STAR_COORDS):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=0, radius=srad, location=(sx, sy, sz))
    st = bpy.context.active_object
    st.name = f"NightStar_{s_i}"
    st.scale = (1.0, 0.55, 1.25)
    st.rotation_euler = (0.2, s_i * 0.5, s_i * 0.8)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    st.data.materials.append(mat_star)
    set_shading(st, smooth=False)
    move_to_collection(st, col_sky)
    star_objs.append(st)

sunbeam_objs = []
for b_i, (bx, by, bz, r1, r2, h) in enumerate(
    [
        (-1.35, -0.15, 2.25, 0.95, 0.35, 4.2),
        (0.55, -0.05, 2.15, 0.85, 0.30, 4.0),
    ]
):
    bpy.ops.mesh.primitive_cone_add(
        vertices=14,
        radius1=r1,
        radius2=r2,
        depth=h,
        location=(bx, by, bz),
        rotation=(0.08, 0.46, 0.0),
    )
    sb = bpy.context.active_object
    sb.name = f"DaySunbeam_{b_i}"
    sb.data.materials.append(mat_sunbeam)
    set_shading(sb, smooth=True)
    sb.hide_render = True
    move_to_collection(sb, col_sky)
    sunbeam_objs.append(sb)

# Close-up preview droplets & night fireflies for Blender renders
tip_focus = ROOT_PATHS["fir_r3"][-1]
preview_objs = [obj_render_back]
for ox, oy, oz, m in [
    (-0.08, -0.06, 0.10, mat_sugar_orb),
    (-0.03, -0.08, -0.04, mat_sugar_orb),
    (0.08, -0.05, -0.09, mat_mineral),
    (0.04, -0.10, 0.04, mat_mineral),
]:
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=14, ring_count=10, radius=0.028, location=(tip_focus[0] + ox, tip_focus[1] + oy, tip_focus[2] + oz)
    )
    orb = bpy.context.active_object
    orb.data.materials.append(m)
    set_shading(orb, smooth=True)
    move_to_collection(orb, col_fungi)
    preview_objs.append(orb)

night_fireflies = []
FIREFLY_SPOTS = [
    (-2.15, -0.55, 0.65), (-1.45, -0.35, 1.15), (-0.85, -0.65, 0.42), (-0.42, 0.15, 0.88),
    (0.35, -0.45, 0.58), (0.95, 0.25, 0.72), (1.55, -0.35, 1.25), (2.45, -0.25, 0.95),
    (-2.95, 0.25, 1.45), (0.15, 0.65, 1.62), (1.85, 0.45, 1.85), (3.05, -0.65, 0.62),
]
for f_i, fpos in enumerate(FIREFLY_SPOTS):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=0.034, location=fpos)
    ff = bpy.context.active_object
    ff.name = f"NightFirefly_{f_i}"
    ff.data.materials.append(mat_firefly_preview)
    set_shading(ff, smooth=True)
    move_to_collection(ff, col_sky)
    night_fireflies.append(ff)
    preview_objs.append(ff)


# ---------------------------------------------------------------------------
# 10. STUDIO DAY & NIGHT LIGHTING RIGS + CAMERAS
# ---------------------------------------------------------------------------
bpy.ops.object.camera_add(location=(0.08, -13.8, 1.65), rotation=(1.455, 0.0, 0.008))
cam_main = bpy.context.active_object
cam_main.name = "DioramaCamera"
cam_main.data.lens = 34
scene.camera = cam_main

bpy.ops.object.camera_add(
    location=(tip_focus[0] - 0.04, tip_focus[1] - 0.98, tip_focus[2] + 0.06),
    rotation=(1.50, 0.0, -0.04),
)
cam_close = bpy.context.active_object
cam_close.name = "RootCloseupCamera"
cam_close.data.lens = 52

day_lights = []
bpy.ops.object.light_add(type="SUN", location=(4.8, -5.5, 9.0), rotation=(0.66, 0.28, 0.46))
sun_day = bpy.context.active_object
sun_day.data.energy = 5.5
sun_day.data.color = (1.0, 0.86, 0.50)
day_lights.append(sun_day)

bpy.ops.object.light_add(type="AREA", location=(-3.0, -8.5, 2.5), rotation=(1.25, 0.0, -0.35))
fill_day = bpy.context.active_object
fill_day.data.energy = 165.0
fill_day.data.size = 9.0
fill_day.data.color = (0.32, 0.72, 0.98)
day_lights.append(fill_day)

bpy.ops.object.light_add(type="AREA", location=(0.0, -6.5, -1.6), rotation=(1.52, 0.0, 0.0))
under_day = bpy.context.active_object
under_day.data.energy = 145.0
under_day.data.size = 6.5
under_day.data.color = (1.0, 0.82, 0.54)
day_lights.append(under_day)

for dp_i, dp_loc in enumerate([(-1.35, -0.35, 0.62), (0.55, 0.25, 0.65)]):
    bpy.ops.object.light_add(type="POINT", location=dp_loc)
    dapple_day = bpy.context.active_object
    dapple_day.data.energy = 52.0
    dapple_day.data.color = (1.0, 0.82, 0.30)
    day_lights.append(dapple_day)

night_lights = []
bpy.ops.object.light_add(type="SUN", location=(-4.2, -5.0, 8.5), rotation=(0.64, -0.26, -0.40))
moon_light = bpy.context.active_object
moon_light.data.energy = 1.55
moon_light.data.color = (0.28, 0.48, 1.0)
night_lights.append(moon_light)

bpy.ops.object.light_add(type="AREA", location=(0.0, -8.5, 1.2), rotation=(1.38, 0.0, 0.0))
fill_night = bpy.context.active_object
fill_night.data.energy = 80.0
fill_night.data.size = 9.5
fill_night.data.color = (0.16, 0.28, 0.84)
night_lights.append(fill_night)

bpy.ops.object.light_add(type="AREA", location=(0.0, -6.5, -1.6), rotation=(1.52, 0.0, 0.0))
under_night = bpy.context.active_object
under_night.data.energy = 68.0
under_night.data.size = 6.5
under_night.data.color = (0.85, 0.56, 0.30)
night_lights.append(under_night)

NIGHT_POINTS = [
    ("NightPineEmerald", (-2.05, 0.35, 1.15), 56.0, (0.12, 1.0, 0.58)),
    ("NightMushAmberL", (-1.05, -0.78, 0.48), 50.0, (1.0, 0.58, 0.12)),
    ("NightMushAmberR", (0.95, 0.48, 0.52), 50.0, (1.0, 0.62, 0.14)),
    ("NightGhostViolet", (3.12, -0.65, 0.62), 42.0, (0.82, 0.34, 1.0)),
    ("NightWebGlowL", (-1.45, -0.35, -1.65), 48.0, (0.48, 1.0, 0.20)),
    ("NightWebGlowR", (1.45, -0.35, -1.65), 48.0, (0.20, 0.96, 0.62)),
]
for lp_name, lp_loc, lp_eng, lp_col in NIGHT_POINTS:
    bpy.ops.object.light_add(type="POINT", location=lp_loc)
    pt_l = bpy.context.active_object
    pt_l.name = lp_name
    pt_l.data.energy = lp_eng
    pt_l.data.color = lp_col
    night_lights.append(pt_l)


def set_lighting_mode(is_night):
    if bg_node:
        bg_node.inputs[0].default_value = (*(WORLD_NIGHT if is_night else WORLD_DAY), 1.0)
        bg_node.inputs[1].default_value = WORLD_STRENGTH
    for l_obj in day_lights:
        l_obj.hide_render = is_night
    for l_obj in night_lights:
        l_obj.hide_render = not is_night
    sun_orb.hide_render = is_night
    moon_obj.hide_render = not is_night
    for s_obj in star_objs:
        s_obj.hide_render = not is_night
    for ff_obj in night_fireflies:
        ff_obj.hide_render = not is_night


# Render DAY & NIGHT studio stills
set_lighting_mode(is_night=False)
scene.camera = cam_main
scene.render.filepath = os.path.join(RENDERS_DIR, "overview_day_3d.png")
bpy.ops.render.render(write_still=True)
scene.render.filepath = os.path.join(RENDERS_DIR, "overview_3d.png")
bpy.ops.render.render(write_still=True)

scene.camera = cam_close
scene.render.filepath = os.path.join(RENDERS_DIR, "root_closeup_day_3d.png")
bpy.ops.render.render(write_still=True)
scene.render.filepath = os.path.join(RENDERS_DIR, "root_closeup_3d.png")
bpy.ops.render.render(write_still=True)

set_lighting_mode(is_night=True)
scene.camera = cam_main
scene.render.filepath = os.path.join(RENDERS_DIR, "overview_night_3d.png")
bpy.ops.render.render(write_still=True)

scene.camera = cam_close
scene.render.filepath = os.path.join(RENDERS_DIR, "root_closeup_night_3d.png")
bpy.ops.render.render(write_still=True)

# Clean up render-only preview helpers & center Sun/Moon at (0,0,0) so WebGL animates their sky arc!
for orb in preview_objs:
    bpy.data.objects.remove(orb, do_unlink=True)

sun_orb.hide_render = False
sun_halo.hide_render = False
moon_obj.hide_render = False
for s_obj in star_objs:
    s_obj.hide_render = False
for sb_obj in sunbeam_objs:
    sb_obj.hide_render = False
obj_shell.hide_render = False
obj_soil.hide_render = False
scene.camera = cam_main

blend_path = os.path.join(OUT_DIR, "wood_wide_web_3d.blend")
glb_path = os.path.join(OUT_DIR, "wood_wide_web_3d.glb")
bpy.ops.wm.save_as_mainfile(filepath=blend_path)
bpy.ops.export_scene.gltf(filepath=glb_path, export_format="GLB")

# Center Sun & Moon at world origin right before WebGL mesh extraction so uOffset drives their exact celestial arc!
sun_orb.location = (0.0, 0.0, 0.0)
sun_halo.location = (0.0, 0.0, 0.0)
moon_obj.location = (0.0, 0.0, 0.0)
bpy.context.view_layer.update()

# ---------------------------------------------------------------------------
# 11. EXPORT SMOOTH-NORMAL BASE64 INT16 MESHES + 3D ROUTES FOR WEBGL
# ---------------------------------------------------------------------------
depsgraph = bpy.context.evaluated_depsgraph_get()
batches = {}
SCALE_POS = 2000.0

for obj in scene.objects:
    if obj.type not in {"MESH", "CURVE"}:
        continue
    eval_obj = obj.evaluated_get(depsgraph)
    try:
        mesh = eval_obj.to_mesh()
    except Exception:
        continue
    if not mesh or len(mesh.vertices) == 0:
        continue

    mesh.transform(eval_obj.matrix_world)
    mesh.calc_loop_triangles()

    mat_name = obj.data.materials[0].name if obj.data.materials else "Default"
    meta = MAT_META.get(
        mat_name,
        {"color": [0.7, 0.7, 0.7], "emission": [0, 0, 0], "emissionStrength": 0.0, "alpha": 1.0, "role": "solid", "smooth": True},
    )
    if meta["role"] == "preview_only":
        eval_obj.to_mesh_clear()
        continue

    use_smooth_nrm = meta.get("smooth", True)
    corner_nrms = mesh.corner_normals if use_smooth_nrm else None

    batch = batches.setdefault(mat_name, {"material": mat_name, "meta": meta, "pos_i16": [], "nrm_i8": []})
    verts = mesh.vertices
    for tri in mesh.loop_triangles:
        fn = tri.normal
        for k in range(3):
            vi = tri.vertices[k]
            li = tri.loops[k]
            co = verts[vi].co
            n = corner_nrms[li].vector if corner_nrms is not None else fn
            batch["pos_i16"].extend(
                [
                    int(round(co.x * SCALE_POS)),
                    int(round(co.z * SCALE_POS)),
                    int(round(-co.y * SCALE_POS)),
                ]
            )
            batch["nrm_i8"].extend(
                [
                    max(-127, min(127, int(round(n.x * 127)))),
                    max(-127, min(127, int(round(n.z * 127)))),
                    max(-127, min(127, int(round(-n.y * 127)))),
                ]
            )

    eval_obj.to_mesh_clear()

serialized_batches = []
total_tris = 0
for b in batches.values():
    v_count = len(b["pos_i16"]) // 3
    total_tris += v_count // 3
    pos_bytes = struct.pack(f"<{len(b['pos_i16'])}h", *b["pos_i16"])
    nrm_bytes = struct.pack(f"<{len(b['nrm_i8'])}b", *b["nrm_i8"])
    serialized_batches.append(
        {
            "material": b["material"],
            "meta": b["meta"],
            "vertexCount": v_count,
            "posB64": base64.b64encode(pos_bytes).decode("ascii"),
            "nrmB64": base64.b64encode(nrm_bytes).decode("ascii"),
        }
    )

FIR_CROWN_3D = (FIR_POS[0], FIR_POS[1], FIR_POS[2] + 2.45)
SAP_CROWN_3D = (SAP_POS[0], SAP_POS[1], SAP_POS[2] + 0.92)
BIRCH_CROWN_3D = (BIRCH_POS[0], BIRCH_POS[1], BIRCH_POS[2] + 2.35)
GHOST_TOP_3D = (GHOST_POS[0], GHOST_POS[1], GHOST_POS[2] + 0.65)

ROUTES_3D = {
    "firSugar1": [b2gl(p) for p in [FIR_CROWN_3D, FIR_POS, *ROOT_PATHS["fir_r1"][1:], HUBS["H1"]]],
    "firSugar2": [b2gl(p) for p in [FIR_CROWN_3D, FIR_POS, *ROOT_PATHS["fir_r3"][1:], HUBS["H3"]]],
    "birchSugar1": [b2gl(p) for p in [BIRCH_CROWN_3D, BIRCH_POS, *ROOT_PATHS["birch_r1"][1:], HUBS["H6"]]],
    "birchSugar2": [b2gl(p) for p in [BIRCH_CROWN_3D, BIRCH_POS, *ROOT_PATHS["birch_r5"][1:], HUBS["H7"]]],
    "saplingFeed1": [
        b2gl(p)
        for p in [
            FIR_CROWN_3D,
            FIR_POS,
            *ROOT_PATHS["fir_r3"][1:],
            HUBS["H3"],
            HUBS["H4"],
            ROOT_PATHS["sap_r1"][-1],
            SAP_POS,
            SAP_CROWN_3D,
        ]
    ],
    "saplingFeed2": [
        b2gl(p)
        for p in [
            BIRCH_CROWN_3D,
            BIRCH_POS,
            *ROOT_PATHS["birch_r1"][1:],
            HUBS["H6"],
            HUBS["H4"],
            ROOT_PATHS["sap_r2"][-1],
            SAP_POS,
            SAP_CROWN_3D,
        ]
    ],
    "mineralToFir": [
        b2gl(p) for p in [PORES[0][1], HUBS["H1"], *reversed(ROOT_PATHS["fir_r1"][1:]), FIR_POS, FIR_CROWN_3D]
    ],
    "mineralToSap": [
        b2gl(p) for p in [PORES[2][1], HUBS["H4"], *reversed(ROOT_PATHS["sap_r3"][1:]), SAP_POS, SAP_CROWN_3D]
    ],
    "mineralToBirch": [
        b2gl(p) for p in [PORES[4][1], HUBS["H6"], *reversed(ROOT_PATHS["birch_r2"][1:]), BIRCH_POS, BIRCH_CROWN_3D]
    ],
    "bugAlarm": [
        b2gl(p)
        for p in [
            FIR_CROWN_3D,
            FIR_POS,
            *ROOT_PATHS["fir_r3"][1:],
            HUBS["H3"],
            HUBS["H4"],
            HUBS["H5"],
            ROOT_PATHS["birch_r1"][-1],
            BIRCH_POS,
            BIRCH_CROWN_3D,
        ]
    ],
    "ghostSiphon": [
        b2gl(p)
        for p in [
            BIRCH_CROWN_3D,
            BIRCH_POS,
            *ROOT_PATHS["birch_r3"][1:],
            HUBS["H8"],
            ROOT_PATHS["ghost_r1"][-1],
            GHOST_POS,
            GHOST_TOP_3D,
        ]
    ],
}

ANCHORS_3D = {
    "fir": b2gl((FIR_POS[0], FIR_POS[1], FIR_POS[2] + 3.25)),
    "sapling": b2gl((SAP_POS[0], SAP_POS[1], SAP_POS[2] + 1.48)),
    "birch": b2gl((BIRCH_POS[0], BIRCH_POS[1], BIRCH_POS[2] + 3.15)),
    "mycelium": b2gl((0.0, -0.45, -1.98)),
    "ghost": b2gl((GHOST_POS[0], GHOST_POS[1], GHOST_POS[2] + 1.08)),
}

# The web engine (engine.js) rebuilds this exact rig in three.js with matching units:
# SUN strength = W/m² (lux-equivalent), AREA power in W, POINT power in W. Blender coordinates/Euler.
def export_light(obj):
    d = obj.data
    entry = {
        "type": d.type,
        "name": obj.name,
        "energy": round(d.energy, 4),
        "color": [round(c, 4) for c in d.color],
        "location": [round(v, 4) for v in obj.location],
        "rotation": [round(v, 5) for v in obj.rotation_euler],
    }
    if d.type == "AREA":
        entry["size"] = round(d.size, 4)
    return entry


payload = {
    "posScale": SCALE_POS,
    "triangleCount": total_tris,
    "batches": serialized_batches,
    "routes": ROUTES_3D,
    "anchors": ANCHORS_3D,
    "lights": {
        "day": [export_light(o) for o in day_lights],
        "night": [export_light(o) for o in night_lights],
    },
    "world": {"day": list(WORLD_DAY), "night": list(WORLD_NIGHT), "strength": WORLD_STRENGTH},
}

js_path = os.path.join(OUT_DIR, "scene_3d_data.js")
with open(js_path, "w", encoding="utf-8") as f:
    f.write("window.WOOD_WIDE_WEB_3D = ")
    json.dump(payload, f, separators=(",", ":"))
    f.write(";\n")

print(f"SUCCESS: Exported {total_tris} smooth-shaded triangles across {len(serialized_batches)} batches!")
