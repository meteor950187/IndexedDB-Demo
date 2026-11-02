export function fixture() {
  const wrap = (BusInfo) => ({
    EssentialInfo: { UpdateTime: "2026/11/03 02:03:04" },
    BusInfo,
  });
  return {
    routes: wrap([
      {
        Id: 1,
        nameZh: "藍１",
        departureZh: "起點",
        destinationZh: "終點",
        providerName: "甲",
        pathAttributeName: "藍１",
      },
      {
        Id: 1,
        nameZh: "藍１",
        departureZh: "起點",
        destinationZh: "終點",
        providerName: "乙",
        pathAttributeName: "藍１副",
      },
      {
        Id: 2,
        nameZh: "紅2",
        departureZh: "東",
        destinationZh: "西",
        providerName: "甲",
      },
    ]),
    locations: wrap([
      { id: 10, name: "台北車站", address: "北側", lat: 25, lon: 121 },
      { id: 20, name: "捷運中山站", address: "南側", lat: 25.1, lon: 121.1 },
      { id: 30, name: "台北車站", address: "東側", lat: 25.2, lon: 121.2 },
    ]),
    stops: wrap([
      {
        Id: 101,
        routeId: 1,
        stopLocationId: 10,
        seqNo: 1,
        goBack: "0",
        nameZh: "臺北車站",
      },
      {
        Id: 102,
        routeId: 1,
        stopLocationId: 20,
        seqNo: 3,
        goBack: "0",
        nameZh: "捷運中山站",
      },
      {
        Id: 103,
        routeId: 1,
        stopLocationId: 10,
        seqNo: 5,
        goBack: "0",
        nameZh: "臺北車站",
      },
      {
        Id: 104,
        routeId: 1,
        stopLocationId: 20,
        seqNo: 1,
        goBack: "1",
        nameZh: "捷運中山站",
      },
      {
        Id: 105,
        routeId: 1,
        stopLocationId: 30,
        seqNo: 2,
        goBack: "1",
        nameZh: "台北車站",
      },
      {
        Id: 106,
        routeId: 2,
        stopLocationId: 10,
        seqNo: 1,
        goBack: "0",
        nameZh: "台北車站",
      },
    ]),
  };
}
