//站點各自的Worker設定
var WorkerSetting = {
    Version : 14,
    EachGameCode: function (GameItem, InsertData) {
        let temps = GameItem.GameCodeCategory;
        let ChampionType = 0;
        for (var ii = 0; ii < temps.length; ii++) {
            let index = temps[ii].CategoryName.indexOf("@")
            if (index != -1) {
                let tagValue = temps[ii].CategoryName.substring(index + 1).trim();
               
                for (var iii = 0; iii < ChampionList.length; iii++) {
                    if (ChampionList[iii].Name == tagValue) {
                        ChampionType = ChampionType | ChampionList[iii].Value;
                    }
                }
            }
        }

        InsertData.ChampionType = ChampionType;

        return InsertData;
    }
};


var ChampionList = [
    {
        Name: "ビッグウィン",
        Value: 1
    },
    {
        Name: "最大倍率",
        Value: 2
    },
    {
        Name: "最大スピン数",
        Value: 4
    }
];

