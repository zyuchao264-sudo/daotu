const engine=require('./rules-engine');

function privateRoom(room,playerId){
  const player=room.players.find(item=>item.playerId===playerId);
  const pending=room.choices?.[0];
  let choice=null;
  if(pending?.playerId===playerId){
    choice={...pending};
    if(choice.kind==='identity')choice={id:choice.id,kind:choice.kind,playerId,declaredType:choice.declaredType,sourceId:choice.sourceId};
    if(choice.kind==='scry')choice.cards=(room.decks[playerId]||[]).filter(card=>choice.cardUids.includes(card.uid));
    if(['master','borrow','discardEnemy'].includes(choice.kind)){
      const target=room.players.find(item=>item.playerId===choice.targetId);
      choice.cards=choice.kind==='discardEnemy'?[...target.hand,...target.equipment]:target.hand;
    }
  }
  const insights=room.players.filter(item=>item.hand.some(card=>card.spyOwnerId===playerId)).map(item=>({playerId:item.playerId,hand:item.hand}));
  return {
    hand:player?player.hand.map(card=>({...card,play:{...engine.cardMetadata(card),freeWindow:card.name==='冲吧！猎狗'&&!!player.dogFollowupAvailable},locked:engine.activeUntil(room,card.lock)})):[],
    secrets:player?.secrets||[],equipment:player?.equipment||[],reconnectToken:player?.reconnectToken||null,
    deckCount:room.decks?.[playerId]?.length||0,equipmentDeckCount:room.equipmentDecks?.[playerId]?.length||0,
    discardCount:player?.discard?.length||0,equipmentDiscardCount:player?.equipmentDiscard?.length||0,
    buildOptions:player?engine.buildOptions(room,player):[],choice,insights
  };
}

module.exports={privateRoom};
