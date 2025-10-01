// Load Sylhet Level-2 boundary
var table = ee.FeatureCollection("FAO/GAUL/2015/level1");
var roi = table.filter(ee.Filter.eq('ADM1_NAME', 'Sylhet'))
               .map(function(f){ return f.simplify(1000); });

Map.centerObject(roi, 10);
Map.addLayer(roi, {}, 'Sylhet ROI');

// --- Dynamic World land cover (2022-2024)
var month_start = 1;
var month_end = 12;
var dw = ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
            .select('label')
            .filterDate('2022','2024')
            .filterBounds(roi)
            .filter(ee.Filter.calendarRange(month_start, month_end,'month'))
            .mode();  // Most frequent class

// --- Create masks for each land cover type
var water = dw.eq(0);
var trees = dw.eq(1);
var crops = dw.eq(2);
var built = dw.eq(6);
var bare = dw.eq(4);
var snow = dw.eq(5);
var wetlands = dw.eq(3); // if needed

// --- Assign colors
var landcover_vis = dw.visualize({
  min:0,
  max:6,
  palette:['blue','green','lightgreen','cyan','grey','white','white'] // water, trees, crops, wetlands, bare, snow, built
});

// Add land cover layer first
Map.addLayer(landcover_vis.clip(roi), {}, 'Land Cover');

// --- Landsat Thermal for UHI ---
var landsat = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
  .select('ST_B10')
  .filterBounds(roi)
  .filterDate('2022','2024')
  .filter(ee.Filter.calendarRange(month_start, month_end,'month'))
  .filter(ee.Filter.lt('CLOUD_COVER',10))
  .map(function(img){
    var gain = ee.Number(img.get('TEMPERATURE_MULT_BAND_ST_B10'));
    var offset = ee.Number(img.get('TEMPERATURE_ADD_BAND_ST_B10'));
    return img.multiply(gain).add(offset)
              .copyProperties(img, img.propertyNames());
  });

var tir_img = landsat.median();
var tir_mean = ee.Number(tir_img.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: roi,
  scale: 100
}).values().get(0));

var uhi = tir_img.expression('(tir - mean)/mean', {'tir':tir_img,'mean':tir_mean}).rename('uhi');

// --- UHI classes (overlay on built areas)
var uhi_class = ee.Image.constant(0)
  .where(uhi.gte(0).and(uhi.lt(0.005)), 1)
  .where(uhi.gte(0.005).and(uhi.lt(0.010)),2)
  .where(uhi.gte(0.010).and(uhi.lt(0.015)),3)
  .where(uhi.gte(0.015).and(uhi.lt(0.020)),4)
  .where(uhi.gte(0.020),5)
  .updateMask(built);  // Only urban

Map.addLayer(uhi_class.clip(roi), {min:1,max:5,palette:['white','yellow','orange','red','brown']}, 'UHI Classes');

// --- Legends ---

// 1. Land Cover Legend
var lc_panel = ui.Panel({style:{position:'bottom-left', padding:'8px 15px'}});
lc_panel.add(ui.Label('Land Cover', {fontWeight:'bold', fontSize:'16px'}));
var lc_colors = ['blue','green','lightgreen','cyan','grey','white','red'];
var lc_names = ['Water','Trees','Crops','Wetlands','Bare','Snow','Built'];
for (var i=0;i<lc_colors.length;i++){
  var colorBox = ui.Label({style:{backgroundColor: lc_colors[i], padding:'8px', margin:'0 0 4px 0'}});
  var desc = ui.Label({value: lc_names[i], style:{margin:'0 0 4px 6px'}});
  lc_panel.add(ui.Panel([colorBox,desc], ui.Panel.Layout.Flow('horizontal')));
}
Map.add(lc_panel);

// 2. UHI Legend
var uhi_panel = ui.Panel({style:{position:'bottom-right', padding:'8px 15px'}});
uhi_panel.add(ui.Label('UHI Classes', {fontWeight:'bold', fontSize:'16px'}));
var uhi_colors = ['white','yellow','orange','red','brown'];
var uhi_names = ['Weak','Moderate','Strong','Stronger','Strongest'];
for (var i=0;i<uhi_colors.length;i++){
  var colorBox = ui.Label({style:{backgroundColor: uhi_colors[i], padding:'8px', margin:'0 0 4px 0'}});
  var desc = ui.Label({value: uhi_names[i], style:{margin:'0 0 4px 6px'}});
  uhi_panel.add(ui.Panel([colorBox,desc], ui.Panel.Layout.Flow('horizontal')));
}
Map.add(uhi_panel);
