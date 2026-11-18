/**
 * Budgy 4.0 build 92 — factual ownership model for private files.
 * iCloud DEVICE BACKUP is an iOS service; iCloud DRIVE export is manual.
 */
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../../src/hooks/useTranslation';

const C = { bg:'#0A0F1C', card:'#151E2D', title:'#F1F5F9', body:'#AAB6C6', green:'#34D399', border:'#2C3545', gold:'#F6C76B' };
export default function DocumentPrivacyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const blocks = [
    { icon:'phone-portrait-outline', title:'local', body:'localDetail', color:C.green },
    { icon:'cloud-done-outline', title:'icloudBackup', body:'icloudBackupDetail', color:C.green },
    { icon:'folder-open-outline', title:'icloudDrive', body:'icloudDriveDetail', color:C.green },
    { icon:'swap-horizontal-outline', title:'restore', body:'restoreDetail', color:C.gold },
    { icon:'server-outline', title:'legacy', body:'legacyDetail', color:C.gold },
  ] as const;
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="document-privacy-back"
          accessibilityRole="button" style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={C.title}/>
        </TouchableOpacity>
        <Text style={styles.title}>{t('documentPrivacy.title')}</Text>
        <View style={styles.back}/>
      </View>
      <ScrollView contentContainerStyle={{ padding:20, paddingBottom: insets.bottom + 55 }}>
        <Text style={styles.headline}>{t('documentPrivacy.subtitle')}</Text>
        <Text style={styles.summary}>{t('documentPrivacy.summary')}</Text>
        {blocks.map((b) => (
          <View key={b.title} style={styles.card}>
            <View style={styles.heading}>
              <Ionicons name={b.icon} size={21} color={b.color}/>
              <Text style={styles.cardTitle}>{t(`documentPrivacy.${b.title}`)}</Text>
            </View>
            <Text style={styles.cardBody}>{t(`documentPrivacy.${b.body}`)}</Text>
          </View>
        ))}
        <View style={[styles.card,{borderColor:'#6F5428'}]}>
          <View style={styles.heading}>
            <Ionicons name="sparkles-outline" size={21} color={C.gold}/>
            <Text style={styles.cardTitle}>{t('documentPrivacy.ocrTitle')}</Text>
          </View>
          <Text style={styles.cardBody}>{t('documentPrivacy.ocrBody')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}
const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:C.bg},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:12,paddingVertical:8},
  back:{width:42,height:42,justifyContent:'center',alignItems:'center'},
  title:{fontSize:17,fontWeight:'700',color:C.title,flex:1,textAlign:'center'},
  headline:{color:C.title,fontSize:23,fontWeight:'800',marginBottom:10},
  summary:{color:C.body,fontSize:14,lineHeight:21,marginBottom:15},
  card:{backgroundColor:C.card,borderColor:C.border,borderWidth:1,borderRadius:15,padding:16,marginBottom:12},
  heading:{flexDirection:'row',gap:10,alignItems:'center',marginBottom:8},
  cardTitle:{color:C.title,fontSize:15,fontWeight:'700',flex:1},
  cardBody:{color:C.body,fontSize:13.5,lineHeight:20},
});
