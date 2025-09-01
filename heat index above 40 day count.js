// Objective: APPROXIMATE the number of days with a dangerous Heat Index (>40°C)
// using the pre-aggregated daily ERA5-Land dataset.

// === 1. DEFINE STUDY AREA AND PARAMETERS ===

// Define the country of interest: Bangladesh.
var country = ee.FeatureCollection('FAO/GAUL/2015/level0')
                .filter(ee.Filter.eq('ADM0_NAME', 'Bangladesh'));
var geometry = country.geometry();
Map.centerObject(geometry, 6);

// Define the time frame and months.
var startDate = '2020-03-01';
var endDate = '2025-07-31';
var months = [3, 4, 5, 6, 7];

// Define the Heat Index "Danger" threshold in Celsius.
var hiThreshold = 40;


// === 2. LOAD DAILY DATA AND CALCULATE APPROXIMATE HI ===

// Load daily max temp and daily mean dewpoint.
var dailyData = ee.ImageCollection("ECMWF/ERA5_LAND/DAILY_AGGR")
    .filterDate(startDate, endDate)
    .filter(ee.Filter.inList('month', months))
    .filterBounds(geometry)
    .select(['temperature_2m_max', 'dewpoint_temperature_2m']);

// Function to calculate an approximate Heat Index from daily aggregate data.
var calculateApproxHI = function(image) {
  // WARNING: This is an approximation. It combines the temperature from the
  // hottest moment of the day with the average dewpoint over the whole day.
  // This is not the true dewpoint at the time of maximum temperature.
  var tMax = image.select('temperature_2m_max');
  var dMean = image.select('dewpoint_temperature_2m');

  // Convert units
  var T_c = tMax.subtract(273.15); // Temperature in Celsius
  var T_f = T_c.multiply(9/5).add(32); // Temperature in Fahrenheit
  var Td_c = dMean.subtract(273.15); // Dewpoint in Celsius

  // Calculate Relative Humidity (RH) in % using the Magnus formula.
  var e = ee.Image(6.11).multiply(T_c.expression(
      '10**((7.5 * Td) / (237.3 + Td))', {'Td': Td_c}));
  var es = ee.Image(6.11).multiply(T_c.expression(
      '10**((7.5 * T) / (237.3 + T))', {'T': T_c}));
  var RH = e.divide(es).multiply(100);

  // NWS Heat Index formula (Steadman's regression)
  var HI_f = ee.Image(-42.379)
    .add(T_f.multiply(2.04901523))
    .add(RH.multiply(10.14333127))
    .subtract(T_f.multiply(RH).multiply(0.22475541))
    .subtract(T_f.pow(2).multiply(0.00683783))
    .subtract(RH.pow(2).multiply(0.05481717))
    .add(T_f.pow(2).multiply(RH).multiply(0.00122874))
    .add(T_f.multiply(RH.pow(2)).multiply(0.00085282))
    .subtract(T_f.pow(2).multiply(RH.pow(2)).multiply(0.00000199));

  // Convert HI from Fahrenheit back to Celsius
  var HI_c = HI_f.subtract(32).multiply(5/9);
  
  return HI_c.rename('approx_heat_index');
};

// Map the function over the daily collection.
var dailyApproxHI = dailyData.map(calculateApproxHI);

// Identify days where the approximate HI was above the threshold.
var dangerousDays = dailyApproxHI.map(function(image) {
  return image.gt(hiThreshold); // Returns 1 if > 40°C, 0 otherwise.
});

// Sum all the binary images to get a total count per pixel.
var totalDangerousDays = dangerousDays.sum().clip(geometry);


// === 3. VISUALIZE THE RESULTS ===

var visParams = {
  min: 0,
  max: 150, // Adjust max based on results for better color contrast
  palette: ['#ffffcc', // very low
  '#ffeda0',
  '#fed976',
  '#feb24c',
  '#fd8d3c',
  '#fc4e2a',
  '#e31a1c',
  '#b10026'  ]
};

Map.addLayer(totalDangerousDays, visParams, 'Approx. Days with Dangerous Heat Index (>40°C)');

var title = ui.Label({
    value: 'Approximate Heat Stress Risk (Using Daily Data)',
    style: { fontSize: '20px', fontWeight: 'bold', position: 'top-center'}
});
Map.add(title);
