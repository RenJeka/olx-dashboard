import { HStack, Input, Stack, Text } from '@chakra-ui/react';
import { Switch } from '../../ui/switch';
import { CollapsibleFilter } from './CollapsibleFilter';
import { LOCAL_FILTER_DESCRIPTIONS } from '../../../constants';

interface Props {
  priceMin: string;
  priceMax: string;
  priceInvert: boolean;
  onPriceMinChange: (val: string) => void;
  onPriceMaxChange: (val: string) => void;
  onPriceInvertChange: (val: boolean) => void;
}

/** 
 * Компонент локального фільтра ціни. 
 * Дозволяє вказати діапазон (мін, макс) та увімкнути інверсію. 
 */
export function PriceFilter({
  priceMin,
  priceMax,
  priceInvert,
  onPriceMinChange,
  onPriceMaxChange,
  onPriceInvertChange,
}: Props) {
  const invertSwitch = (
    <Switch
      size="sm"
      colorPalette="warning"
      checked={priceInvert}
      onCheckedChange={(d) => onPriceInvertChange(d.checked)}
    >
      Інвертувати
    </Switch>
  );

  return (
    <CollapsibleFilter title="Діапазон цін" actions={invertSwitch}>
      <Stack gap={2}>
        <Text textStyle="xs" color="fg.muted">
          {priceInvert
            ? LOCAL_FILTER_DESCRIPTIONS.price.invert
            : LOCAL_FILTER_DESCRIPTIONS.price.normal}
        </Text>
        <HStack gap={2}>
          <Input
            size="sm"
            w="120px"
            placeholder="мін"
            inputMode="decimal"
            value={priceMin}
            onChange={(e) => onPriceMinChange(e.target.value)}
          />
          <Input
            size="sm"
            w="120px"
            placeholder="макс"
            inputMode="decimal"
            value={priceMax}
            onChange={(e) => onPriceMaxChange(e.target.value)}
          />
        </HStack>
      </Stack>
    </CollapsibleFilter>
  );
}
