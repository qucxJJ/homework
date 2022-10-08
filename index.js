const COUNT = 30; // max count of item div
const BATCH_NUM = 10; // a batch has 10 items 
const DIVIDE_AT_NUM = 5; // if < 5, append the previous 10 items, and remove the last 10 items; else perform opposite
const ITEM_HEIGHT = 48; // height of each item
const DEFAULT_PADDING_BOTTOM = 10; // default padding bottom of inner container

const PADDING_UNIT = ITEM_HEIGHT * BATCH_NUM; // padding of a batch

// query features with pagination, return features infomation(includes attributes and geometry) array
async function queryFeatures(view, layerView, page) {
    const query = {
        start: page,
        num: 10,
        outFields: ["*"],
        returnGeometry: true,
        geometry: view.extent,
        // orderByFields: ["objectid"]
    };
    return await layerView.queryFeatures(query).then((featureSet) => {
        return featureSet.features.map((feature) => ({ attributes: feature.attributes, geometry: feature.geometry }));
    });
}

function requireArcGISCallback(esriConfig, Map, MapView, FeatureLayer) {
    esriConfig.apiKey =
        "AAPK7c4467b0b734403b961cff710cae09e8_4-HVhzQsd3AeBdwf7BkOnqxYRNGiGCr9-zUK1f-SRSiKwR-fNmpAeoCVcNIVVmQ";

    // init map
    const map = new Map({
        basemap: "arcgis-topographic" // Basemap layer service
    });

    // init map view
    const view = new MapView({
        map: map,
        center: [-95.65653305531178, 40.56722211718503],
        zoom: 4,
        container: "viewDiv",
    });

    const countiesLayer = new FeatureLayer({
        url: 'http://sampleserver6.arcgisonline.com/arcgis/rest/services/USA/MapServer/3'
        
    });
    map.add(countiesLayer);

    const statesLayer = new FeatureLayer({
        url: 'http://sampleserver6.arcgisonline.com/arcgis/rest/services/USA/MapServer/2'
    });
    map.add(statesLayer);

    const highwaysLayer = new FeatureLayer({
        url: 'http://sampleserver6.arcgisonline.com/arcgis/rest/services/USA/MapServer/1'
    });
    map.add(highwaysLayer);

    // cities layer
    const citiesLayer = new FeatureLayer({
        url: "http://sampleserver6.arcgisonline.com/arcgis/rest/services/USA/MapServer/0",
        outFields: ['*'],
        renderer: {
            type: "simple",
            // feature symbol
            symbol: {
                type: "simple-marker",
                color: [255, 255, 115, 255],
                outline: {
                    color: [0, 0, 0, 255],
                    width: 1
                },
            },
            // get feature symbol size according to pop2000 field
            visualVariables: [
                {
                    type: "size",
                    field: "pop2000",
                    stops: [
                        {
                            value: 8035,
                            size: 2,
                        },
                        {
                            value: 8008278,
                            size: 60,
                        }
                    ]

                }
            ],
        },
    });
    map.add(citiesLayer);

    let citiesLayerview;

    // get layer view
    view.whenLayerView(citiesLayer).then((layerView) => {
        citiesLayerview = layerView;
    });

    let citiesInfos = [];
    let page = 0;
    let inRequest = false;

    const outerContainer = document.querySelector('.list-container');
    const innerContainer = document.querySelector('.list-container-inner');

    // change innerHTML of inner list container
    const changeInnerHTML = (startIndex) => {
        if (startIndex < 0) {
            return;
        }
        const end = Math.min(startIndex + COUNT, citiesInfos.length);
        let innerHTML = '';
        for (let i = startIndex; i < end; i++) {
            const { attributes } = citiesInfos[i];
            innerHTML += `<div class="item">
                    <div>${i}: <span class="areaname" data-index="${i}">${attributes.areaname}</span></div>
                    <span>capital: ${attributes.capital}</span>
                    <span>class: ${attributes.class}</span>
                    <span>objectid: ${attributes.objectid}</span>
                    <span>pop2000: ${attributes.pop2000}</span>
                    <span>st: ${attributes.st}</span>
                </div>`
        }
        innerContainer.innerHTML = innerHTML;
        innerContainer.style.paddingTop = startIndex * ITEM_HEIGHT + 'px';
        innerContainer.style.paddingBottom = Math.max(citiesInfos.length - end, 0) * ITEM_HEIGHT + DEFAULT_PADDING_BOTTOM + 'px';
    }


    // concat features info
    const getCitiesInfos = () => {
        inRequest = true;
        return queryFeatures(view, citiesLayerview, page++).then((featureInfos) => {
            inRequest = false;
            citiesInfos = [...citiesInfos, ...featureInfos];
        });
    }

    // when items < 30, change innerHTML directly
    const changeInnerHTMLDirectly = async () => {
        await getCitiesInfos();
        changeInnerHTML(0);
    }

    // fit map by layer extent
    citiesLayer.when(() => {
        view.goTo(citiesLayer.fullExtent);
    });

    let viewExtent;
 
    view.whenLayerView(citiesLayer).then((layerView) => {
        citiesLayerview = layerView;
        citiesLayerview.watch("updating", (val) => {
          if(!val){  // wait for the layer view to finish updating
            if (!citiesInfos.length) {
                // query the first 10 items
                changeInnerHTMLDirectly();
                viewExtent =  view.extent;
                return;
            }

            // if view extent updated, get the cities info start from page 0
            if (view.extent !== viewExtent) {
                viewExtent = view.extent;

                page = 0;
                citiesInfos = [];
                changeInnerHTMLDirectly();
            }
          }
        });
      });

    /**
     * feature highlight start
     */

    let highlightSelect;

    // when hover the list, highlight city
    innerContainer.addEventListener('mouseover', (e) => {
        if (e.target.classList.contains('areaname')) {
            // get feature info according to index
            const index = Number(e.target.getAttribute('data-index'));
            const featureInfo = citiesInfos[index];
            const objectId = featureInfo.attributes.objectid;

            if (citiesLayerview) {
                if (highlightSelect) {
                    highlightSelect.remove();
                }
                // hightlight feature
                highlightSelect = citiesLayerview.highlight(objectId);
            }
        }
    })

    /**
     * feature highlight end
     */

    let prevDataBatch = -1;

    const changeInnerHTMLAfterScrollUp = (newDataBatch) => {
        prevDataBatch = newDataBatch;
        changeInnerHTML((newDataBatch - 1) * BATCH_NUM);
    }

    const changeInnerHTMLAfterScrollDown = (newDataBatch) => {
        prevDataBatch = newDataBatch;
        changeInnerHTML(newDataBatch * BATCH_NUM);
    }

    const scrollCallback = async () => {
        // prev request has not finish yet
        if (inRequest) {
            return;
        }

        const scrollTop = Math.max(outerContainer.scrollTop, 0);
        const currentIndex = Math.floor(scrollTop / ITEM_HEIGHT);
        const newDataBatch = Math.floor(currentIndex / BATCH_NUM);


        // when total data less than 30, only need to query new data
        if (citiesInfos.length < COUNT) {

            // scroll from top, and not arrive at the fifth item, query features and append children directly
            // need not update data batch
            if (currentIndex % BATCH_NUM < DIVIDE_AT_NUM) {
                if (citiesInfos.length < (COUNT - BATCH_NUM)) {
                    changeInnerHTMLDirectly();
                }
                return;
            }

            // to ensure see the data immediatly at the next batch scroll, query features and append children directly when scroll over the fifth item  
            prevDataBatch = newDataBatch;
            changeInnerHTMLDirectly();
            return;
        }

        const delta = newDataBatch - prevDataBatch;
        // scroll down to see top data
        if (delta < 0) {
            // scroll at the first batch, do nothing
            if (newDataBatch === 0) {
                prevDataBatch = newDataBatch;
                innerContainer.style.paddingTop = '0px';
                innerContainer.style.paddingBottom = Math.max(citiesInfos.length - 2 * BATCH_NUM, 0) * ITEM_HEIGHT + DEFAULT_PADDING_BOTTOM + 'px';
                return;
            }

            // not arrive the fifth item, do nothing
            if (currentIndex % BATCH_NUM > DIVIDE_AT_NUM) {
                return;
            }

            // arrive at the fifth item, remove 10 items from bottom, and add 10 items at top
            changeInnerHTMLAfterScrollUp(newDataBatch);
            return;
        }

        // scroll up to see bottom data
        if (delta > 0) {

            // not arrive the fifth item, do nothing
            if (currentIndex % BATCH_NUM < DIVIDE_AT_NUM) {
                return; 
            }

            // need to query more features
            if ((newDataBatch + 2) * BATCH_NUM >= citiesInfos.length) {
                const oldLen = citiesInfos.length;

                await getCitiesInfos();

                // if has more data, add 10 items at bottom and remove 10 items from top
                if (citiesInfos.length > oldLen) {
                    changeInnerHTMLAfterScrollDown(newDataBatch);
                }
                return;
            }


            // add 10 items at bottom and remove 10 items from top
            changeInnerHTMLAfterScrollDown(newDataBatch);
        }

        // scroll in the same batch, eg: 20-29
        if (delta === 0) {
            // scroll at the top part
            if (currentIndex % BATCH_NUM < DIVIDE_AT_NUM) {
                changeInnerHTMLAfterScrollUp(newDataBatch);
            } else {
                // scroll at the bottom part
                changeInnerHTMLAfterScrollDown(newDataBatch);
            }
        }
    }

    outerContainer.addEventListener('scroll', scrollCallback);
}
